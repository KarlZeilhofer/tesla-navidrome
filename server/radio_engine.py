"""Pure recommendation policy; audio extraction and account authorization live elsewhere."""
import math
from collections import Counter
import random
import re
import numpy as np

MODEL_VERSION = 'effnet-yamnet-3x20-v3'


def unit(vector):
    value = np.asarray(vector, dtype=np.float32)
    norm = float(np.linalg.norm(value))
    return value / norm if norm > 1e-10 else np.zeros_like(value)


def content_kind(speech, music, singing, speech_fraction, music_fraction):
    # A voice alone is not speech: singing and rapping have separate model labels.
    if speech_fraction >= 0.6 and speech > 0.35 and music_fraction < 0.45 and singing < 0.18:
        return 'speech'
    if music_fraction >= 0.55 or music > 0.5 or singing > 0.25:
        return 'music'
    return 'unknown'


def song_key(song):
    normalize = lambda value: re.sub(r'\s+', ' ', str(value or '').casefold()).strip()
    return normalize(song.get('artist')), normalize(song.get('title'))


def apply_artist_context(features, catalog):
    totals = Counter(str(catalog[song_id].get('artist', '')).casefold() for song_id in features)
    speech = Counter(str(catalog[song_id].get('artist', '')).casefold() for song_id, item in features.items() if item.get('detectedKind', item['kind']) == 'speech')
    for song_id, item in features.items():
        artist = str(catalog[song_id].get('artist', '')).casefold()
        if artist and item.get('override', 'auto') == 'auto' and speech[artist] >= 4 and speech[artist] / totals[artist] >= 0.65:
            item['kind'] = 'speech'
            item['classificationReason'] = 'predominantly_spoken_artist'


def recommend(features, candidates, recent_ids, anchor_id=None, exclude_ids=(), count=3, skip_ids=(), rng=None):
    rng = rng or random.SystemRandom()
    by_id = {str(song['id']): song for song in candidates}
    recent_ids = [str(song_id) for song_id in recent_ids][-5:]
    recent = [features[song_id] for song_id in recent_ids if song_id in features and features[song_id].get('vector')]
    anchor = features.get(str(anchor_id)) if anchor_id else None
    if not recent and anchor and anchor.get('vector'):
        recent = [anchor]
    if not recent:
        return [], 'no_context'
    # Unknown content must not silently seed the wrong type of station.
    kind = next((item.get('kind') for item in reversed(recent) if item.get('kind') in ('music', 'speech')), None)
    if kind is None and anchor:
        kind = anchor.get('kind')
    if kind not in ('music', 'speech'):
        return [], 'unknown_content'
    context = unit(sum(unit(item['vector']) * (index + 1) for index, item in enumerate(recent)))
    # Keep the deliberate starting point, but allow an explicit change from music to speech.
    anchor_vector = unit(anchor['vector']) if anchor and anchor.get('vector') and anchor.get('kind') == kind else context
    excluded = {str(song_id) for song_id in exclude_ids}
    excluded_keys = {song_key(by_id[song_id]) for song_id in excluded if song_id in by_id}
    skipped = {str(song_id) for song_id in skip_ids}
    previous_artists = [song_key(by_id[song_id])[0] for song_id in recent_ids if song_id in by_id]
    pool = []
    seen = set()
    for song_id, song in by_id.items():
        feature = features.get(song_id)
        key = song_key(song)
        if song_id in excluded or key in excluded_keys or key in seen or not feature or feature.get('kind') != kind or not feature.get('vector'):
            continue
        vector = unit(feature['vector'])
        similarity = float(0.65 * np.dot(vector, context) + 0.35 * np.dot(vector, anchor_vector))
        if not math.isfinite(similarity) or similarity < 0.25:
            continue
        score = similarity + 0.015 * min(5, max(0, float(song.get('rating', 0))))
        if song.get('liked'):
            score += 0.025
        if key[0] in previous_artists[-2:]:
            score -= 0.1
        if song_id in skipped:
            score -= 0.2
        pool.append({'id': song_id, 'score': score, 'similarity': similarity, 'artist': key[0], 'key': key})
        seen.add(key)
    selected = []
    used_artists = []
    while pool and len(selected) < max(0, min(8, count)):
        for item in pool:
            item['adjusted'] = item['score'] - 0.16 * used_artists.count(item['artist'])
        pool.sort(key=lambda item: item['adjusted'], reverse=True)
        best = pool[0]['adjusted']
        # Randomize within good matches, not across the entire library.
        shortlist = [item for item in pool[:30] if item['adjusted'] >= best - 0.18]
        weights = [math.exp((item['adjusted'] - best) / 0.055) for item in shortlist]
        chosen = rng.choices(shortlist, weights=weights, k=1)[0]
        selected.append({'id': chosen['id'], 'similarity': round(chosen['similarity'], 4)})
        used_artists.append(chosen['artist'])
        pool.remove(chosen)
    return selected, 'matched' if selected else 'no_matches'
