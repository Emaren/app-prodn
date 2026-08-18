"use client";

import { useEffect, type ReactNode } from "react";

import type { SiteTranslationCatalog } from "@/lib/i18n/siteCopy";
import { translateSiteCopy } from "@/lib/i18n/siteCopy";
import type { UniversalLanguageCode } from "@/lib/i18n/languages";

const TRANSLATABLE_ATTRIBUTES = [
  "aria-label",
  "placeholder",
  "title",
  "alt",
] as const;

const SKIP_SELECTOR = [
  "[data-i18n-skip]",
  "script",
  "style",
  "code",
  "pre",
  "textarea",
  "[contenteditable='true']",
  "[contenteditable='']",
].join(",");

type TextState = {
  source: string;
  translated: string;
};

type AttributeState = {
  source: string;
  translated: string;
};

function skipped(node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return Boolean(element?.closest(SKIP_SELECTOR));
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export default function SiteTranslationLayer({
  locale,
  children,
}: {
  locale: UniversalLanguageCode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (locale !== "es") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    const textStates = new Map<Text, TextState>();
    const attributeStates = new Map<Element, Map<string, AttributeState>>();

    const translateTextNode = (node: Text, catalog: SiteTranslationCatalog) => {
      if (skipped(node)) return;
      const raw = node.nodeValue ?? "";
      const source = raw.trim();
      if (!source) return;

      const prior = textStates.get(node);
      if (prior && source === prior.translated) return;

      const translated = translateSiteCopy(catalog, source);
      if (translated === source) return;

      textStates.set(node, { source, translated });
      node.nodeValue = preserveWhitespace(raw, translated);
    };

    const translateAttributes = (
      element: Element,
      catalog: SiteTranslationCatalog,
    ) => {
      if (skipped(element)) return;

      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const source = element.getAttribute(attribute)?.trim();
        if (!source) continue;

        const prior = attributeStates.get(element)?.get(attribute);
        if (prior && source === prior.translated) continue;

        const translated = translateSiteCopy(catalog, source);
        if (translated === source) continue;

        const states = attributeStates.get(element) ?? new Map();
        states.set(attribute, { source, translated });
        attributeStates.set(element, states);
        element.setAttribute(attribute, translated);
      }
    };

    const translateTree = (root: Node, catalog: SiteTranslationCatalog) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root as Text, catalog);
        return;
      }

      if (
        root.nodeType !== Node.ELEMENT_NODE &&
        root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
      ) {
        return;
      }

      if (root.nodeType === Node.ELEMENT_NODE) {
        const element = root as Element;
        if (skipped(element)) return;
        translateAttributes(element, catalog);
      }

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );

      let current: Node | null = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.TEXT_NODE) {
          translateTextNode(current as Text, catalog);
        } else {
          translateAttributes(current as Element, catalog);
        }
        current = walker.nextNode();
      }
    };

    void import("@/messages/site/es.json")
      .then((module) => {
        if (cancelled) return;
        const catalog = module.default as SiteTranslationCatalog;
        const root = document.body;
        translateTree(root, catalog);

        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === "characterData") {
              translateTextNode(mutation.target as Text, catalog);
              continue;
            }

            if (mutation.type === "attributes") {
              translateAttributes(mutation.target as Element, catalog);
              continue;
            }

            for (const added of mutation.addedNodes) {
              translateTree(added, catalog);
            }
          }
        });

        observer.observe(root, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
        });

        document.documentElement.dataset.aoe2warSiteCatalog = "es";
      })
      .catch((error: unknown) => {
        console.error("AoE2WAR Spanish site catalog failed to load.", error);
      });

    return () => {
      cancelled = true;
      observer?.disconnect();

      for (const [node, state] of textStates) {
        if (!node.isConnected) continue;
        const raw = node.nodeValue ?? "";
        if (raw.trim() !== state.translated) continue;
        node.nodeValue = preserveWhitespace(raw, state.source);
      }

      for (const [element, states] of attributeStates) {
        if (!element.isConnected) continue;
        for (const [attribute, state] of states) {
          if (element.getAttribute(attribute)?.trim() !== state.translated) {
            continue;
          }
          element.setAttribute(attribute, state.source);
        }
      }

      delete document.documentElement.dataset.aoe2warSiteCatalog;
    };
  }, [locale]);

  return children;
}
