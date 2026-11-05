import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TestBrowser } from './helpers/test-browser.ts';

class TestElement {
  textContent = '';
  className = '';
  hidden = false;
  children: TestElement[] = [];
  append(child: TestElement): void {
    this.children.push(child);
  }
  prepend(child: TestElement): void {
    this.children.unshift(child);
  }
  replaceChildren(): void {
    this.children = [];
  }
  get childElementCount(): number {
    return this.children.length;
  }
  addEventListener(): void {}
}

test('the app lists its initial URL and transfers complete relative URLs', async (t) => {
  for (const primary of [true, false]) {
    await t.test(primary ? 'primary' : 'secondary', async (t) => {
      const browser = new TestBrowser();
      const elements = new Map<string, TestElement>();
      const openedUrl = '/tasks?message=Hello%20world&filter=open#details';
      let focusCalls = 0;
      let closeCalls = 0;
      let address = `https://example.test${openedUrl}`;
      const historyEntries = [address];
      let historyIndex = 0;
      const globals = {
        HTMLElement: TestElement,
        HTMLParagraphElement: TestElement,
        HTMLSpanElement: TestElement,
        HTMLAnchorElement: TestElement,
        HTMLDivElement: TestElement,
        navigator: { locks: browser.locks },
        BroadcastChannel: function () {
          return browser.createChannel();
        },
        document: {
          title: 'central-tasklist',
          visibilityState: 'hidden',
          hasFocus: () => false,
          getElementById: (id: string) => {
            if (!elements.has(id)) elements.set(id, new TestElement());
            return elements.get(id);
          },
          createElement: () => new TestElement(),
          addEventListener: () => {},
        },
        window: {
          location: { href: address },
          history: {
            replaceState: (_state: unknown, _title: string, url: URL) => {
              address = url.href;
              historyEntries[historyIndex] = address;
            },
            pushState: (_state: unknown, _title: string, url: string) => {
              address = new URL(url, address).href;
              historyEntries.splice(historyIndex + 1);
              historyEntries.push(address);
              historyIndex += 1;
            },
            back: () => {
              if (historyIndex > 0) address = historyEntries[--historyIndex]!;
            },
            forward: () => {
              if (historyIndex < historyEntries.length - 1)
                address = historyEntries[++historyIndex]!;
            },
          },
          focus: () => focusCalls++,
          close: () => closeCalls++,
          addEventListener: () => {},
        },
      };
      for (const [name, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
          if (previous) Object.defineProperty(globalThis, name, previous);
          else Reflect.deleteProperty(globalThis, name);
        });
      }

      await import(
        new URL(`../src/app.ts?primary=${primary}`, import.meta.url).href
      );
      await browser.registerAs(primary);
      assert.equal(new URL(address).searchParams.get('key'), 'main-tab-demo');

      const list = elements.get('opened-urls')!;
      if (primary) {
        assert.equal(list.children[0]?.children[0]?.textContent, openedUrl);
        assert.equal(elements.get('opened-url-count')?.textContent, '1');
        assert.equal(focusCalls, 0);
        assert.equal(globals.document.title, 'Primary | central-tasklist');
        assert.deepEqual(browser.published, []);

        const transferredUrl = '/tasks?key=main-tab-demo&message=Next#section';
        browser.deliver({ type: 'message', value: transferredUrl });
        assert.equal(address, `https://example.test${transferredUrl}`);
        assert.equal(historyEntries.length, 2);
        assert.deepEqual(
          list.children.map((item) => item.children[0]?.textContent),
          [transferredUrl, openedUrl],
        );
        assert.equal(list.children[0]?.className, list.children[1]?.className);
        assert.equal(elements.get('opened-url-count')?.textContent, '2');
        assert.equal(globals.document.title, '(1) Primary | central-tasklist');
        assert.equal(focusCalls, 1);
        assert.equal(closeCalls, 0);

        const initialItem = list.children[1];
        const nextUrl = '/other-task?key=main-tab-demo&id=42#summary';
        browser.deliver({ type: 'message', value: nextUrl });
        assert.equal(address, `https://example.test${nextUrl}`);
        assert.equal(historyEntries.length, 3);
        assert.equal(list.children[2], initialItem);
        globals.window.history.back();
        assert.equal(address, `https://example.test${transferredUrl}`);
        globals.window.history.forward();
        assert.equal(address, `https://example.test${nextUrl}`);
        assert.deepEqual(
          list.children.map((item) => item.children[0]?.textContent),
          [nextUrl, transferredUrl, openedUrl],
        );
        assert.equal(elements.get('opened-url-count')?.textContent, '3');
        assert.equal(browser.transportClosed, false);
      } else {
        assert.deepEqual(browser.published, [
          { type: 'message', value: openedUrl },
        ]);
        assert.equal(closeCalls, 1);
        assert.equal(list.children.length, 0);
        assert.equal(historyEntries.length, 1);
      }
    });
  }
});
