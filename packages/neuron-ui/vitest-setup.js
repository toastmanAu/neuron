import '@testing-library/jest-dom'

/**
 * jsdom implements `<dialog>` as an element but not its modal methods, and Neuron's `Dialog`
 * widget calls `showModal()` from an effect. Without this, that throw tears the tree down and the
 * component renders nothing — which is why no test had ever rendered a Dialog.
 *
 * Minimal and faithful enough for tests: `open` reflects the state, and `close()` fires the
 * `close` event the widget listens for.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.show) {
    HTMLDialogElement.prototype.show = function show() {
      this.open = true
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(returnValue) {
      this.open = false
      if (returnValue !== undefined) {
        this.returnValue = returnValue
      }
      this.dispatchEvent(new Event('close'))
    }
  }
}
