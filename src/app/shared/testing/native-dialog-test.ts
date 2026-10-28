export function stubNativeDialog(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const showDescriptor = Object.getOwnPropertyDescriptor(prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'close');
  Object.defineProperty(prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute('open', ''); },
  });
  Object.defineProperty(prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute('open'); },
  });
  return () => {
    if (showDescriptor) Object.defineProperty(prototype, 'showModal', showDescriptor);
    else Reflect.deleteProperty(prototype, 'showModal');
    if (closeDescriptor) Object.defineProperty(prototype, 'close', closeDescriptor);
    else Reflect.deleteProperty(prototype, 'close');
  };
}
