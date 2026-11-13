#!/usr/bin/env python3
"""Local audio analysis and similarity service. Navidrome DB access is read-only."""
import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import sqlite3
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from radio_engine import MODEL_VERSION, unit, content_kind, recommend, apply_artist_context

DATA_DIR = Path(os.environ.get('RADIO_DATA_DIR', '/var/lib/tesla-navidrome-radio'))
MODELS = Path(os.environ.get('RADIO_MODELS_DIR', '/opt/tesla-navidrome-radio/models'))
NAVIDROME_DB = os.environ.get('RADIO_NAVIDROME_DB', '/var/lib/navidrome/navidrome.db')
PORT = int(os.environ.get('RADIO_PORT', '4782'))
lock = threading.RLock()
features = {}
catalog = {}
priorities = []
progress = {'total': 0, 'analyzed': 0, 'failed': 0, 'running': False}


def connect():
    db = sqlite3.connect(DATA_DIR / 'analysis.sqlite', timeout=15)
    db.execute('PRAGMA journal_mode=WAL')
    return db


def initialize():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS analysis (id TEXT PRIMARY KEY, fingerprint TEXT, version TEXT, data TEXT, error TEXT, updated REAL)')
        db.execute('CREATE TABLE IF NOT EXISTS overrides (id TEXT PRIMARY KEY, kind TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS audio_cache (hash TEXT, version TEXT, data TEXT, PRIMARY KEY(hash,version))')


def load_catalog():
    db = sqlite3.connect('file:' + NAVIDROME_DB + '?mode=ro', uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute('SELECT m.id,m.path,m.title,m.artist,m.duration,l.path library_path FROM media_file m JOIN library l ON m.library_id=l.id WHERE m.missing=0').fetchall()
        result = {}
        for row in rows:
            song = dict(row)
            source = Path(song['path'])
            source = source if source.is_absolute() else Path(song['library_path']) / source
            try:
                source = source.resolve(strict=True)
                if Path(song['library_path']).resolve() not in source.parents:
                    continue
                stat = source.stat()
                song['file'] = str(source)
                song['fingerprint'] = f'{source}:{stat.st_size}:{stat.st_mtime_ns}'
                result[song['id']] = song
            except OSError:
                continue
        return result
    finally:
        db.close()


def refresh():
    global catalog, features
    current = load_catalog()
    with connect() as db:
        overrides = dict(db.execute('SELECT id,kind FROM overrides'))
        rows = db.execute('SELECT id,fingerprint,version,data,error FROM analysis').fetchall()
    ready = {}
    failed = 0
    for song_id, fingerprint, version, data, error in rows:
        if song_id not in current or fingerprint != current[song_id]['fingerprint'] or version != MODEL_VERSION:
            continue
        if error:
            failed += 1
            continue
        item = json.loads(data)
        item['detectedKind'] = item['kind']
        item['override'] = overrides.get(song_id, 'auto')
        item['kind'] = overrides.get(song_id, item['kind'])
        ready[song_id] = item
    # Musical interludes in a predominantly spoken comedy collection should not
    # unexpectedly enter a music station. Manual song overrides always win.
    apply_artist_context(ready, current)
    with lock:
        catalog, features = current, ready
        progress.update(total=len(current), analyzed=len(ready), failed=failed)
    return current


class Analyzer:
    def __init__(self):
        from essentia.standard import TensorflowPredictEffnetDiscogs, TensorflowPredictVGGish
        self.embedding = TensorflowPredictEffnetDiscogs(graphFilename=str(MODELS / 'discogs-effnet.pb'), output='PartitionedCall:1', batchSize=64, patchHopSize=0, lastPatchMode='repeat', lastBatchMode='zeros')
        self.yamnet = TensorflowPredictVGGish(graphFilename=str(MODELS / 'yamnet.pb'), input='melspectrogram', output='activations', batchSize=16, patchHopSize=0, lastPatchMode='repeat')
        self.labels = json.loads((MODELS / 'yamnet.json').read_text())['classes']

    def analyze(self, song):
        duration = max(1, float(song.get('duration') or 1))
        starts = sorted(set(round(max(0, min(duration - 20, duration * fraction - 10)), 2) for fraction in (0.2, 0.5, 0.8)))
        clips = []
        for start in starts:
            result = subprocess.run(['/usr/bin/ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-ss', str(start), '-i', song['file'], '-t', '20', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], capture_output=True, check=True, timeout=60)
            audio = np.frombuffer(result.stdout, dtype='<f4').copy()
            if audio.size < 16000:
                raise ValueError('Audioausschnitt ist zu kurz')
            if audio.size < 48000:
                audio = np.pad(audio, (0, 48000 - audio.size))
            clips.append(audio)
        audio = np.concatenate(clips)
        # The published graph hardcodes a 64-patch batch. Pad the waveform rather
        # than averaging model responses to padded silence into the song vector.
        valid_patches = int(np.ceil(len(audio) / (128 * 256)))
        padded = np.pad(audio, (0, max(0, 64 * 128 * 256 - 512 - len(audio))))
        predicted = np.asarray(self.embedding(padded))[:valid_patches]
        events = np.asarray(self.yamnet(audio))
        def scores(names):
            indices = [self.labels.index(name) for name in names if name in self.labels]
            return events[:, indices].max(axis=1)
        speech = scores(['Speech', 'Conversation', 'Narration, monologue'])
        music = scores(['Music'])
        singing = scores(['Singing', 'Rapping', 'Choir', 'Chant'])
        stats = {'speech': float(speech.mean()), 'music': float(music.mean()), 'singing': float(singing.mean()), 'speechFraction': float((speech > 0.45).mean()), 'musicFraction': float((music > 0.35).mean())}
        kind = content_kind(stats['speech'], stats['music'], stats['singing'], stats['speechFraction'], stats['musicFraction'])
        return {'vector': unit(predicted.mean(axis=0)).tolist(), 'kind': kind, 'scores': stats, 'segments': len(starts)}


def worker():
    analyzer = None
    while True:
        try:
            current = refresh()
            with connect() as db:
                cached = {row[0]: row[1:] for row in db.execute('SELECT id,fingerprint,version,updated FROM analysis')}
            pending = [song for song in current.values() if song['id'] not in cached or cached[song['id']][0] != song['fingerprint'] or cached[song['id']][1] != MODEL_VERSION or (song['id'] not in features and time.time() - cached[song['id']][2] > 86400)]
            # Failed entries are retried after a day; restart never discards good vectors.
            with lock:
                priority_ids = list(priorities)
                priorities.clear()
                ready_ids = set(features)
            for song_id in priority_ids:
                if song_id in current and song_id not in ready_ids and current[song_id] not in pending:
                    pending.insert(0, current[song_id])
            pending.sort(key=lambda song: (song['id'] not in priority_ids, song['id']))
            while pending:
                with lock:
                    requested = list(dict.fromkeys(priorities))
                    priorities.clear()
                    for song_id in reversed(requested):
                        if song_id in catalog and song_id not in features:
                            candidate = catalog[song_id]
                            pending = [candidate] + [item for item in pending if item['id'] != song_id]
                song = pending.pop(0)
                if analyzer is None:
                    analyzer = Analyzer()
                with lock:
                    progress['running'] = True
                started = time.monotonic()
                try:
                    with open(song['file'], 'rb') as source:
                        source_hash = hashlib.file_digest(source, 'sha256').hexdigest()
                    with connect() as db:
                        cached_audio = db.execute('SELECT data FROM audio_cache WHERE hash=? AND version=?', (source_hash, MODEL_VERSION)).fetchone()
                    if cached_audio:
                        data = json.loads(cached_audio[0])
                    else:
                        data = analyzer.analyze(song)
                        with connect() as db:
                            db.execute('INSERT OR REPLACE INTO audio_cache VALUES (?,?,?)', (source_hash, MODEL_VERSION, json.dumps(data)))
                    error = None
                except Exception as exception:
                    data, error = None, str(exception)[:500]
                    logging.warning('Analysis failed for %s: %s', song['id'], error)
                with connect() as db:
                    db.execute('INSERT OR REPLACE INTO analysis VALUES (?,?,?,?,?,?)', (song['id'], song['fingerprint'], MODEL_VERSION, json.dumps(data) if data else None, error, time.time()))
                refresh()
                logging.info('Analyzed %s (%s) in %.1fs; %s/%s ready', song['id'], data['kind'] if data else 'failed', time.monotonic() - started, progress['analyzed'], progress['total'])
            with lock:
                progress['running'] = False
        except Exception:
            logging.exception('Radio analysis cycle failed')
        time.sleep(30)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, value):
        payload = json.dumps(value, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        with lock:
            self.respond(200 if self.path == '/status' else 404, dict(progress))

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', 0))
            if size < 1 or size > 4 * 1024 * 1024:
                return self.respond(400, {'error': 'Ungültige Anfrage'})
            body = json.loads(self.rfile.read(size))
            if self.path == '/recommend':
                with lock:
                    matches, reason = recommend(features, body.get('candidates', []), body.get('recentIds', []), body.get('anchorId'), body.get('excludeIds', []), int(body.get('count', 3)), body.get('skipIds', []))
                    priorities.extend(song_id for song_id in body.get('recentIds', []) if song_id not in features)
                    status = dict(progress)
                return self.respond(200, {'matches': matches, 'reason': reason, 'analysis': status})
            if self.path == '/info':
                with lock:
                    item = features.get(str(body.get('id')))
                    status = dict(progress)
                return self.respond(200, {'analysis': status, 'song': {key: value for key, value in item.items() if key != 'vector'} if item else None})
            if self.path == '/override':
                kind = body.get('kind')
                if kind not in ('auto', 'music', 'speech'):
                    return self.respond(400, {'error': 'Ungültiger Inhaltstyp'})
                with connect() as db:
                    if kind == 'auto':
                        db.execute('DELETE FROM overrides WHERE id=?', (str(body['id']),))
                    else:
                        db.execute('INSERT OR REPLACE INTO overrides VALUES (?,?)', (str(body['id']), kind))
                refresh()
                return self.respond(200, {'ok': True})
            return self.respond(404, {'error': 'Unbekannte Anfrage'})
        except Exception:
            logging.exception('Radio request failed')
            self.respond(500, {'error': 'Radio-Anfrage fehlgeschlagen'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--analyze-one', help='Analyze one Navidrome song ID and print the result without its vector')
    args = parser.parse_args()
    initialize()
    refresh()
    if args.analyze_one:
        song = catalog[args.analyze_one]
        item = Analyzer().analyze(song)
        print(json.dumps({key: value for key, value in item.items() if key != 'vector'}))
        return
    threading.Thread(target=worker, daemon=True).start()
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    main()
