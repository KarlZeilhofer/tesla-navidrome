import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
import uuid

spec = importlib.util.spec_from_file_location('music_files', Path(__file__).parents[1] / 'server/music-files.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MusicFilesTest(unittest.TestCase):
    def test_preview_changed_file_rejection_removal_and_retention(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            music = root / 'music'
            trash = root / 'trash'
            music.mkdir()
            trash.mkdir()
            song = music / 'track.flac'
            song.write_bytes(b'audio fixture')
            database = root / 'test.db'
            with sqlite3.connect(database) as db:
                db.execute('create table library (id integer,path text)')
                db.execute('insert into library values (?,?)', (1, str(music)))
                db.execute('create table media_file (id text,path text,title text,artist text,library_id integer)')
                db.execute('insert into media_file values (?,?,?,?,?)', ('song', song.name, 'Song', 'Artist', 1))
            def request(action, body):
                output = io.StringIO()
                with patch('sys.stdin', io.StringIO(json.dumps(body))), patch('sys.argv', ['helper', action]), contextlib.redirect_stdout(output):
                    module.main()
                return json.loads(output.getvalue())
            with patch.object(module, 'MUSIC_ROOT', str(music)), patch.object(module, 'TRASH_ROOT', str(trash)), patch.object(module, 'DATABASE', str(database)):
                preview = request('--preview', {'ids': ['song']})
                self.assertTrue(song.exists())
                with self.assertRaises(ValueError):
                    request('--delete', {'ids': ['song'], 'expected': []})
                self.assertTrue(song.exists())
                song.write_bytes(b'changed audio fixture')
                with self.assertRaises(ValueError):
                    request('--delete', {'ids': ['song'], 'expected': preview['files']})
                self.assertTrue(song.exists())
                preview = request('--preview', {'ids': ['song']})
                self.assertIsInstance(preview['files'][0]['mtime'], str)
                self.assertEqual(request('--delete', {'ids': ['song'], 'expected': preview['files']})['removed'], ['song'])
                self.assertFalse(song.exists())
                fresh = next(trash.iterdir())
                self.assertTrue((fresh / 'track.flac').exists())
                old = trash / str(uuid.uuid4())
                old.mkdir()
                manifest = old / 'manifest.json'
                manifest.write_text('[]')
                os.utime(manifest, (0, 0))
                module.cleanup_trash()
                self.assertFalse(old.exists())
                self.assertTrue(fresh.exists())

if __name__ == '__main__':
    unittest.main()
