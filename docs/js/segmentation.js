// SPDX-License-Identifier: AGPL-3.0-or-later
/** One worker / model at a time; cancellation terminates inference and releases its session. */
export class Segmenter {
  cancel() { if (this.active) this.active.cancel(); }
  run(blob, quality, progress) {
    this.cancel();
    if (!globalThis.Worker || !globalThis.WebAssembly) return Promise.reject(Error('Automatic masking is unsupported here. Import a mask or use the correction brush.'));
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./segment-worker.js', import.meta.url), { type: 'module' });
      let finished = false;
      const finish = (error, result) => {
        if (finished) return; finished = true; clearTimeout(timeout); worker.terminate();
        if (this.active?.worker === worker) this.active = null;
        error ? reject(error) : resolve(result);
      };
      const timeout = setTimeout(() => finish(Error('Masking timed out. Your photographs and previous mask are safe. Try Compact mode, import a mask, or paint it manually.')), 180000);
      this.active = { worker, cancel: () => finish(new DOMException('Processing cancelled', 'AbortError')) };
      worker.onmessage = ({data}) => {
        if (data.kind === 'progress') progress(data);
        else if (data.kind === 'result') finish(null, data.blob);
        else if (data.kind === 'error') finish(Error('Automatic masking failed: '+data.message+' Use an imported mask or manual correction.'));
      };
      worker.onerror = () => finish(Error('The masking worker could not load. Check your connection or use an imported mask / manual correction.'));
      worker.postMessage({ blob, quality });
    });
  }
}
