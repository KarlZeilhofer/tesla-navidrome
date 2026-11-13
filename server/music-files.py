#!/usr/bin/python3
"""Resolve selected song IDs and move confirmed duplicates to recoverable storage."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import uuid
import socket
import grp
import io
import contextlib
import datetime
import calendar
import time

MUSIC_ROOT = '/srv/music'
TRASH_ROOT = '/srv/tesla-navidrome-trash'
DATABASE = '/var/lib/navidrome/navidrome.db'

def cleanup_trash():
    # Sweep hourly, allowing one interval so files never exceed three months.
    now = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    month_index = now.year * 12 + now.month - 1 - 3
    year, month = divmod(month_index, 12)
    month += 1
    cutoff = now.replace(year=year, month=month, day=min(now.day, calendar.monthrange(year, month)[1])).timestamp()
    trash = Path(TRASH_ROOT)
    for folder in trash.iterdir():
        try:
            uuid.UUID(folder.name)
            if folder.is_dir() and not folder.is_symlink() and (folder / 'manifest.json').stat().st_mtime <= cutoff:
                shutil.rmtree(folder)
        except (ValueError, FileNotFoundError):
            continue

def main():
    body = json.load(sys.stdin)
    ids = body.get('ids', [])
    if not isinstance(ids, list) or not 0 < len(ids) <= 200:
        raise ValueError('Ungültige Songliste')
    music = Path(MUSIC_ROOT).resolve()
    db = sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True)
    rows = []
    for song_id in dict.fromkeys(ids):
        row = db.execute('SELECT m.id,m.path,m.title,m.artist,l.path FROM media_file m JOIN library l ON l.id=m.library_id WHERE m.id=?', (str(song_id),)).fetchone()
        if not row:
            raise ValueError('Song nicht gefunden: ' + str(song_id))
        source = Path(row[1])
        file = (source if source.is_absolute() else Path(row[4]) / source).resolve(strict=True)
        if music not in file.parents or not file.is_file():
            raise ValueError('Datei außerhalb des Musikordners')
        stat = file.stat()
        rows.append(dict(id=row[0], path=str(file), title=row[2], artist=row[3], size=stat.st_size, mtime=str(stat.st_mtime_ns), inode=str(stat.st_ino)))
    if sys.argv[1:] == ['--delete']:
        if rows != body.get('expected'):
            raise ValueError('Dateiliste hat sich geändert. Bitte erneut prüfen.')
        trash = Path(TRASH_ROOT) / str(uuid.uuid4())
        trash.mkdir(parents=True, mode=0o700)
        (trash / 'manifest.json').write_text(json.dumps(rows, ensure_ascii=False))
        for row in rows:
            source = Path(row['path'])
            destination = trash / source.relative_to(music)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(destination))
        print(json.dumps({'removed': [row['id'] for row in rows]}))
    elif sys.argv[1:] == ['--preview']:
        print(json.dumps({'files': rows}))
    else:
        raise ValueError('Ungültiger Aufruf')

if __name__ == '__main__' and sys.argv[1:] == ['--serve']:
    address = '/run/tesla-music-files/socket'
    server = socket.socket(socket.AF_UNIX)
    server.bind(address)
    os.chown(address, 0, grp.getgrnam('tesla-navidrome-control').gr_gid)
    os.chmod(address, 0o660)
    server.listen(4)
    server.settimeout(3600)
    last_cleanup = 0
    while True:
        if time.time() - last_cleanup >= 3600:
            cleanup_trash()
            last_cleanup = time.time()
        try:
            connection, _ = server.accept()
        except socket.timeout:
            continue
        with connection:
            try:
                connection.settimeout(30)
                data = b''
                while b'\n' not in data:
                    chunk = connection.recv(65536)
                    if not chunk or len(data) > 1024 * 1024:
                        raise ValueError('Ungültige Anfrage')
                    data += chunk
                request = json.loads(data.split(b'\n')[0])
                sys.argv = [sys.argv[0], '--delete' if request.get('delete') else '--preview']
                sys.stdin = io.StringIO(json.dumps(request))
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    main()
                connection.sendall(output.getvalue().encode())
            except Exception as error:
                connection.sendall((json.dumps({'error': str(error)}) + '\n').encode())
elif __name__ == '__main__':
    main()
