"use client";

import { useEffect } from "react";
import legacyDocument from "../index.html?raw";
import mainScript from "../script.js?raw";
import excelTableScript from "../excel-table.js?raw";
import recordToolsScript from "../record-tools.js?raw";

const bodyMatch = legacyDocument.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const legacyBodyHtml = (bodyMatch?.[1] || "").replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ""
);

const legacyScripts = [mainScript, excelTableScript, recordToolsScript];

function loadLegacyScripts() {
  if (window.__LABNOTE_NEXT_INITIALIZED__) {
    return;
  }

  try {
    legacyScripts.forEach((source, index) => {
      const script = document.createElement("script");
      script.type = "text/javascript";
      script.dataset.labnoteLegacy = String(index + 1);
      script.textContent = source;
      document.body.appendChild(script);
    });

    window.__LABNOTE_NEXT_INITIALIZED__ = true;
  } catch (error) {
    console.error("LabNote 初始化失败：", error);
  }
}

export default function HomePage() {
  useEffect(() => {
    loadLegacyScripts();
  }, []);

  return (
    <div
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: legacyBodyHtml }}
    />
  );
}
