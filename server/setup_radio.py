"""Download pinned model artifacts; never distribute weights through Git."""
import hashlib
import json
from pathlib import Path
import urllib.request

def digest(file):
    checksum = hashlib.sha256()
    with file.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()

def main():
    artifacts = json.loads((Path(__file__).parent / 'radio-models.json').read_text())
    destination = Path('/opt/tesla-navidrome-radio/models')
    destination.mkdir(parents=True, exist_ok=True)
    for name, artifact in artifacts.items():
        file = destination / name
        if file.exists() and digest(file) == artifact['sha256']:
            continue
        temporary = destination / (name + '.download')
        with urllib.request.urlopen(artifact['url'], timeout=60) as response, temporary.open('wb') as output:
            for chunk in iter(lambda: response.read(1024 * 1024), b''):
                output.write(chunk)
        if digest(temporary) != artifact['sha256']:
            temporary.unlink()
            raise ValueError('Model checksum mismatch: ' + name)
        temporary.chmod(0o644)
        temporary.replace(file)
        print('Downloaded and verified', name)

if __name__ == '__main__':
    main()
