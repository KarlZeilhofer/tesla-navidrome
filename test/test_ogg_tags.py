import base64
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from mutagen import File
from mutagen.flac import Picture

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('write_ogg_tags', ROOT / 'server/write_ogg_tags.py')
writer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writer)


class OggTagsTest(unittest.TestCase):
    def test_embedded_picture_and_audio_survive_vorbis_and_opus_tag_edit(self):
        for extension, codec in [('ogg', 'libvorbis'), ('opus', 'libopus')]:
            with self.subTest(codec=codec), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / ('König zurück.' + extension)
                destination = Path(directory) / ('new.' + extension)
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', codec, str(source)], check=True, capture_output=True)
                picture = Picture()
                picture.type = 3
                picture.mime = 'image/png'
                picture.width = picture.height = 192
                picture.data = (ROOT / 'public/icons/icon-192.png').read_bytes()
                encoded = base64.b64encode(picture.write()).decode('ascii')
                audio = File(source)
                audio['metadata_block_picture'] = [encoded]
                audio['lyrics'] = ['Unveränderte Wörter: äöü ß']
                audio['custom-test'] = ['keep me']
                audio.save()
                original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
                def packets(file):
                    return subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(file), '-map', '0:a:0', '-c', 'copy', '-f', 'data', 'pipe:1'], check=True, capture_output=True).stdout
                before = packets(source)
                writer.write_tags(source, destination, {'title': 'Der König kehrt zurück', 'artist': 'Künstler', 'album': 'Löwen', 'albumArtist': 'Künstler', 'track': 19, 'disc': 1, 'year': 2003, 'genre': 'Soundtrack'})
                edited = File(destination)
                self.assertEqual(edited['title'], ['Der König kehrt zurück'])
                self.assertEqual(edited['albumartist'], ['Künstler'])
                self.assertEqual(edited['tracknumber'], ['19'])
                self.assertEqual(edited['metadata_block_picture'], [encoded])
                self.assertEqual(edited['lyrics'], ['Unveränderte Wörter: äöü ß'])
                self.assertEqual(edited['custom-test'], ['keep me'])
                self.assertEqual(packets(destination), before)
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_hash)


if __name__ == '__main__':
    unittest.main()
