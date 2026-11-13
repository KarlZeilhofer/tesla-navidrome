import importlib.util
from pathlib import Path
import random
import unittest

spec = importlib.util.spec_from_file_location('radio_engine', Path(__file__).parents[1] / 'server/radio_engine.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class SmartRadioTest(unittest.TestCase):
    def feature(self, vector, kind='music'):
        return {'vector': vector, 'kind': kind}

    def test_music_never_includes_nearby_spoken_cabaret(self):
        features = {'seed': self.feature([1, 0]), 'music': self.feature([0.95, 0.1]), 'cabaret': self.feature([1, 0], 'speech'), 'unknown': self.feature([1, 0], 'unknown')}
        candidates = [{'id': key, 'title': key, 'artist': key} for key in features]
        matches, reason = engine.recommend(features, candidates, ['seed'], 'seed', ['seed'], 3, rng=random.Random(1))
        self.assertEqual([item['id'] for item in matches], ['music'])
        self.assertEqual(reason, 'matched')

    def test_duplicate_titles_recent_tracks_and_artist_repetition(self):
        features = {key: self.feature([1, 0]) for key in ['seed', 'duplicate', 'other', 'other2', 'different']}
        candidates = [
            {'id': 'seed', 'title': 'Same Song', 'artist': 'Artist'},
            {'id': 'duplicate', 'title': 'Same Song', 'artist': 'Artist'},
            {'id': 'other', 'title': 'Other', 'artist': 'Repeated'},
            {'id': 'other2', 'title': 'Other2', 'artist': 'Repeated'},
            {'id': 'different', 'title': 'Different', 'artist': 'New'},
        ]
        matches, _ = engine.recommend(features, candidates, ['seed'], 'seed', ['seed'], 2, rng=random.Random(4))
        self.assertNotIn('duplicate', [item['id'] for item in matches])
        self.assertIn('different', [item['id'] for item in matches])

    def test_explicit_speech_context_can_recommend_speech(self):
        features = {'seed': self.feature([1, 0], 'speech'), 'cabaret': self.feature([1, 0], 'speech'), 'music': self.feature([1, 0])}
        candidates = [{'id': key, 'title': key, 'artist': key} for key in features]
        matches, _ = engine.recommend(features, candidates, ['seed'], 'seed', ['seed'])
        self.assertEqual([item['id'] for item in matches], ['cabaret'])

    def test_anchor_prevents_drift_and_missing_context_does_not_randomize(self):
        features = {'anchor': self.feature([1, 0]), 'recent': self.feature([0.7, 0.7]), 'close': self.feature([0.9, 0.1]), 'drift': self.feature([0.1, 0.9])}
        songs = [{'id': key, 'artist': key, 'title': key} for key in features]
        matches, _ = engine.recommend(features, songs, ['recent'], 'anchor', ['anchor', 'recent'], 1, rng=random.Random(1))
        self.assertEqual(matches[0]['id'], 'close')
        self.assertEqual(engine.recommend(features, songs, ['missing'])[1], 'no_context')
        features['unclear'] = self.feature([1, 0], 'unknown')
        self.assertEqual(engine.recommend(features, songs, ['unclear'])[1], 'unknown_content')

    def test_singing_is_not_mistaken_for_spoken_word(self):
        self.assertEqual(engine.content_kind(0.9, 0.03, 0.02, 0.9, 0.05), 'speech')
        self.assertEqual(engine.content_kind(0.6, 0.8, 0.7, 0.7, 0.9), 'music')
        self.assertEqual(engine.content_kind(0.1, 0.1, 0.01, 0.1, 0.1), 'unknown')

    def test_comedy_artist_context_and_manual_exception(self):
        features = {str(i): self.feature([1, 0], 'speech') for i in range(4)}
        features['interlude'] = self.feature([1, 0])
        features['exception'] = {**self.feature([1, 0]), 'override': 'music'}
        catalog = {key: {'artist': 'Comedy Artist'} for key in features}
        engine.apply_artist_context(features, catalog)
        self.assertEqual(features['interlude']['kind'], 'speech')
        self.assertEqual(features['exception']['kind'], 'music')


if __name__ == '__main__':
    unittest.main()
