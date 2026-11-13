#!/usr/bin/env python3
"""Read-only production smoke test against indexed, real-library audio."""
import json
from pathlib import Path
import sys
import urllib.request
sys.path.insert(0, '/opt/tesla-navidrome-radio')
import radio_server as radio
import numpy as np

radio.initialize()
radio.refresh()
assert radio.features, 'No analyzed tracks available yet'
for feature in radio.features.values():
    vector = np.asarray(feature['vector'])
    assert vector.shape == (1280,) and np.isfinite(vector).all()
    assert 0.99 < np.linalg.norm(vector) < 1.01
candidates = [{key: song[key] for key in ('id', 'title', 'artist')} for song in radio.catalog.values()]
examples = []
for artist in ('Thomas Bergersen', 'Pendulum', 'Nick Phoenix', 'Martina Schwarzmann'):
    seeds = [song for song_id, song in radio.catalog.items() if song_id in radio.features and song['artist'] == artist]
    if not seeds:
        continue
    seed = seeds[0]
    body = {'candidates': candidates, 'recentIds': [seed['id']], 'anchorId': seed['id'], 'excludeIds': [seed['id']], 'count': 3}
    request = urllib.request.Request('http://127.0.0.1:4782/recommend', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    result = json.load(urllib.request.urlopen(request, timeout=10))
    matches = result['matches']
    for item in matches:
        assert radio.features[item['id']]['kind'] == radio.features[seed['id']]['kind']
        assert item['id'] != seed['id']
    examples.append({'seed': f"{artist} - {seed['title']}", 'kind': radio.features[seed['id']]['kind'], 'recommendations': [f"{radio.catalog[item['id']]['artist']} - {radio.catalog[item['id']]['title']}" for item in matches]})
assert examples, 'No representative seed analyzed yet'
print(json.dumps({'analysis': radio.progress, 'examples': examples}, ensure_ascii=False, indent=2))
