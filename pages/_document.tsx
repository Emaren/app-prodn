import Document, {
    Html,
    Head,
    Main,
    NextScript,
    DocumentContext,
    DocumentInitialProps
  } from "next/document";
  import crypto from "crypto";
  
  interface MyDocumentProps extends DocumentInitialProps {
    nonce: string;
  }
  
  /**
   * Inline suppressor to:
   *  0) Block any injected <script> without our nonce
   *  1) Hijack console.error to swallow known extension errors
   *  2) Monkey-patch defineProperty/defineProperties
   *  3) Wrap call/apply so bound invocations are caught
   *  4) Pre-define extension globals as non-configurable
   *  5) Swallow residual error/unhandledrejection events
   */
  const EXTENSION_SUPPRESSOR = (nonce: string) => `
    (function(){
      // 0) Block any <script> nodes that don’t carry our nonce
      const _append  = Node.prototype.appendChild;
      const _insert  = Node.prototype.insertBefore;
      Node.prototype.appendChild = function(node) {
        if (
          node.tagName === 'SCRIPT' &&
          node.getAttribute('nonce') !== '${nonce}'
        ) {
          return node;
        }
        return _append.call(this, node);
      };
      Node.prototype.insertBefore = function(node, ref) {
        if (
          node.tagName === 'SCRIPT' &&
          node.getAttribute('nonce') !== '${nonce}'
        ) {
          return node;
        }
        return _insert.call(this, node, ref);
      };
  
      // 1) Hijack console.error first
      const _err = console.error;
      console.error = function(...args) {
        const m = args[0];
        if (
          typeof m === 'string' &&
          (
            m.includes('Cannot redefine property:') ||
            m.toLowerCase().includes('error inject') ||
            m.includes('Access to storage is not allowed')
          )
        ) {
          return;
        }
        return _err.apply(this, args);
      };
  
      // 2) Save native fns
      const _dp    = Object.defineProperty;
      const _dps   = Object.defineProperties;
      const fProto = Function.prototype;
      const _call  = fProto.call;
      const _apply = fProto.apply;
  
      // 3) Override defineProperty/defineProperties
      Object.defineProperty = function(target, key, desc) {
        try { return _dp(target, key, desc); }
        catch (e) {
          if (e.message.includes("Cannot redefine property:")) return target;
          throw e;
        }
      };
      Object.defineProperties = function(target, props) {
        try { return _dps(target, props); }
        catch (e) {
          if (e.message.includes("Cannot redefine property:")) return target;
          throw e;
        }
      };
  
      // 4) Wrap .call & .apply so bound calls also get caught
      fProto.call = function(thisArg, ...args) {
        try { return _call.apply(this, [thisArg, ...args]); }
        catch (e) {
          if (
            (this === Object.defineProperty || this === Object.defineProperties) &&
            e.message.includes("Cannot redefine property:")
          ) return thisArg;
          throw e;
        }
      };
      fProto.apply = function(thisArg, args) {
        try { return _apply.call(this, thisArg, args); }
        catch (e) {
          if (
            (this === Object.defineProperty || this === Object.defineProperties) &&
            e.message.includes("Cannot redefine property:")
          ) return thisArg;
          throw e;
        }
      };
  
      // 5) Pre-define known extension props as non-configurable
      ['ethereum','solana','phantom','tron'].forEach((prop) => {
        try {
          _dp(window, prop, {
            get: () => undefined,
            set: () => {},
            configurable: false
          });
        } catch (_) {}
      });
  
      // 6) Swallow any residual errors / rejections
      window.addEventListener('error', (evt) => {
        const m = evt.message || '';
        if (
          m.includes('Cannot redefine property:') ||
          m.includes('Access to storage is not allowed')
        ) evt.stopImmediatePropagation();
      }, true);
      window.addEventListener('unhandledrejection', (evt) => {
        const r = evt.reason?.message || evt.reason || '';
        if (
          r.includes('Cannot redefine property:') ||
          r.includes('Access to storage is not allowed')
        ) evt.preventDefault();
      }, true);
    })();
  `;
  
  export default class MyDocument extends Document<MyDocumentProps> {
    static async getInitialProps(ctx: DocumentContext) {
      const initialProps = await Document.getInitialProps(ctx);
      const nonce = crypto.randomBytes(16).toString("base64");
      return {
        ...initialProps,
        nonce
      };
    }
  
    render() {
      const { nonce } = this.props;
  
      return (
        <Html lang="en">
          <Head>
            {/* Strict CSP: only our scripts with matching nonce may run */}
            <meta
              httpEquiv="Content-Security-Policy"
              content={
                `default-src 'self'; ` +
                `script-src 'self' 'nonce-${nonce}'; ` +
                `object-src 'none';`
              }
            />
  
            {/* Inline suppressor (must carry our nonce) */}
            <script
              nonce={nonce}
              dangerouslySetInnerHTML={{ __html: EXTENSION_SUPPRESSOR(nonce) }}
            />
  
            {/* Your other metas, icons, manifest, etc. */}
            <meta name="mobile-web-app-capable" content="yes" />
            <meta
              name="apple-mobile-web-app-status-bar-style"
              content="black-translucent"
            />
            <meta name="apple-mobile-web-app-title" content="AoE2 Betting" />
            <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
            <link rel="manifest" href="/manifest.json" />
            <title>AoE2 Betting</title>
          </Head>
          <body className="bg-gray-900 text-white min-h-screen flex flex-col">
            <Main />
            <NextScript nonce={nonce} />
          </body>
        </Html>
      );
    }
  }
  