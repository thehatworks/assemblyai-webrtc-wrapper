const min = Math.min,
      max = Math.max;

const setString = function(view, offset, str) {
  const len = str.length;
  for (const i = 0; i < len; ++i) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

function Encoder(sampleRate, numChannels) {
  this.sampleRate = sampleRate;
  this.numChannels = numChannels;
  this.numSamples = 0;
  this.dataViews = [];
};

Encoder.prototype.encode = function(buffer) {
  var len = buffer[0].length,
      nCh = this.numChannels,
      view = new DataView(new ArrayBuffer(len * nCh * 2)),
      offset = 0;
    
  for (var i = 0; i < len; ++i) {
    for (var ch = 0; ch < nCh; ++ch) {
      var x = buffer[ch][i] * 0x7fff;
      view.setInt16(offset, x < 0 ? max(x, -0x8000) : min(x, 0x7fff), true);
      offset += 2;      
    }
  }

  this.dataViews.push(view);
  this.numSamples += len;
};

Encoder.prototype.finish = function(mimeType) {
  const dataSize = this.numChannels * this.numSamples * 2,
        view = new DataView(new ArrayBuffer(44));
  setString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  setString(view, 8, 'WAVE');
  setString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, this.numChannels, true);
  view.setUint32(24, this.sampleRate, true);
  view.setUint32(28, this.sampleRate * 4, true);
  view.setUint16(32, this.numChannels * 2, true);
  view.setUint16(34, 16, true);
  setString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  this.dataViews.unshift(view);
  const blob = new Blob(this.dataViews, { type: 'audio/wav' });
  this.cleanup();
  return blob;
};

Encoder.prototype.cancel = Encoder.prototype.cleanup = function() {
  delete this.dataViews;
};

const WavAudioEncoder = Encoder;

let buffers = undefined,
    encoder = undefined;

self.onmessage = (event) => {
  var data = event.data;
  switch (data.command) {
    case 'start':
      encoder = new WavAudioEncoder(data.sampleRate, data.numChannels);
      buffers = data.process === 'separate' ? [] : undefined;
      break;
    case 'record':
      if (buffers != null)
        buffers.push(data.buffers);
      else
        encoder.encode(data.buffers);
      break;
    case 'finish':
      if (buffers != null)
        while (buffers.length > 0)
          encoder.encode(buffers.shift());
      self.postMessage({ blob: encoder.finish() });
      encoder = undefined;
      break;
    case 'cancel':
      encoder.cancel();
      encoder = undefined;
  }
};
