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

const legacyBundle = [mainScript, excelTableScript, recordToolsScript].join(
  "\n;\n"
);

function loadLegacyScripts() {
  if (window.__LABNOTE_NEXT_INITIALIZED__) {
    return;
  }

  try {
    const script = document.createElement("script");
    script.type = "module";
    script.dataset.labnoteLegacy = "bundle";
    script.textContent = legacyBundle;
    script.addEventListener("error", (event) => {
      console.error("LabNote 脚本加载失败：", event);
      window.__LABNOTE_NEXT_INITIALIZED__ = false;
    });

    document.body.appendChild(script);
    window.__LABNOTE_NEXT_INITIALIZED__ = true;
  } catch (error) {
    window.__LABNOTE_NEXT_INITIALIZED__ = false;
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
