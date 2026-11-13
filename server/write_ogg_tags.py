"""Update Vorbis comments on a copy, preserving audio packets and embedded artwork."""
import json
from pathlib import Path
import shutil
import sys
from mutagen import File
from mutagen.ogg import OggFileType


def write_tags(source, destination, metadata):
    audio = File(source)
    if not isinstance(audio, OggFileType):
        raise ValueError('Die Datei enthält keinen unterstützten Ogg-Audiostream.')
    shutil.copyfile(source, destination)
    audio = File(destination)
    if audio.tags is None:
        audio.add_tags()
    fields = {
        'title': metadata.get('title'),
        'artist': metadata.get('artist'),
        'album': metadata.get('album'),
        'albumartist': metadata.get('albumArtist'),
        'tracknumber': metadata.get('track'),
        'discnumber': metadata.get('disc'),
        'date': metadata.get('year'),
        'genre': metadata.get('genre'),
    }
    # Do not replace the comment block: pictures, lyrics and custom tags stay intact.
    for key, value in fields.items():
        if value:
            audio[key] = [str(value)]
        elif key in audio:
            del audio[key]
    audio.save()


if __name__ == '__main__':
    try:
        write_tags(Path(sys.argv[1]), Path(sys.argv[2]), json.load(sys.stdin))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
