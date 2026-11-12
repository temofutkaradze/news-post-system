// SPDX-License-Identifier: AGPL-3.0-or-later
// This disposable worker is loaded ONLY after the user requests automatic masking.
self.onmessage = async ({ data }) => {
  try {
    const { segmentForeground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
    const blob = await segmentForeground(data.blob, {
      model: data.quality === 'detail' ? 'isnet_fp16' : 'isnet_quint8',
      device: 'cpu', proxyToWorker: false, output: { format: 'image/png' },
      progress: (key, current, total) => self.postMessage({ kind: 'progress', downloading: key.includes('fetch'), percent: total ? Math.round(current / total * 100) : null })
    });
    self.postMessage({ kind: 'result', blob });
  } catch (error) {
    self.postMessage({ kind: 'error', message: String(error?.message || error).slice(0, 350) });
  }
};
