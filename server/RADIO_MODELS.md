# Audio models and attribution

Smart Radio uses Essentia TensorFlow wrappers from the Music Technology Group,
Universitat Pompeu Fabra: https://essentia.upf.edu/machine_learning.html

- Discogs-EffNet, Pablo Alonso / MTG, 2022. 1280-dimensional audio embeddings.
  https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json
  Paper: Alonso-Jiménez, Serra and Bogdanov, “Music Representation Learning Based
  on Editorial Metadata from Discogs”, ISMIR 2022.
- AudioSet-YAMNet TensorFlow export, Pablo Alonso / MTG, 2021, based on Google's
  YAMNet/AudioSet. Used to distinguish speech, music, singing and rapping.
  https://essentia.upf.edu/models/audio-event-recognition/yamnet/audioset-yamnet-1.json

MTG model artifacts are CC BY-NC-SA 4.0 (non-commercial), with commercial licensing
available separately: https://essentia.upf.edu/models.html
License: https://creativecommons.org/licenses/by-nc-sa/4.0/
The Essentia library is distributed under AGPLv3 / proprietary licensing.

Weights are downloaded directly from the publisher and verified using the pinned
SHA-256 values in `radio-models.json`. They are not committed to this repository.
Audio analysis is local; no music is sent to third-party services.
