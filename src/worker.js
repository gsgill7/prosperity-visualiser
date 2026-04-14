importScripts('parser.js');

self.onmessage = function(e) {
  try {
    const data = self.parseFile(e.data);
    self.postMessage({ success: true, data: data });
  } catch (err) {
    self.postMessage({ success: false, error: err.toString() });
  }
};

