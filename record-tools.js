"use strict";

const recordToolsState = {
    editingRecordId: null
};

const recordToolsElements = {};

initializeRecordTools();

function initializeRecordTools() {
    if (typeof elements === "undefined" || typeof records === "undefined") {
        console.warn("记录增强组件未找到 LabNote 主程序。");
        return;
    }

    restoreRecordUpdateTimes();
    createEditingControls();
    enhanceSearchInterface();
    enhanceExportInterface();
    overrideRecordCardRenderer();
    overrideArchiveSearch();
    bindRecordToolEvents();
    setRecordFormMode(false);
    renderApp();
}

function restoreRecordUpdateTimes() {
    try {
        const rawRecords = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(rawRecords)) {
            return;
        }

        const updateTimes = new Map(rawRecords.map((record) => [
            String(record.id || ""),
            typeof record.updatedAt === "string" ? record.updatedAt : ""
        ]));

        records = records.map((record) => ({
            ...record,
            updatedAt: updateTimes.get(record.id) || record.updatedAt || ""
        }));
    } catch (error) {
        console.warn("恢复记录修改时间失败：", error);
    }
}

function createEditingControls() {
    recordToolsElements.formTitle = document.getElementById("newRecordTitle");
    recordToolsElements.modeBadge = document.querySelector(".form-panel .badge");
    recordToolsElements.submitButton = elements.form.querySelector('button[type="submit"]');

    const actionContainer = document.createElement("div");
    actionContainer.className = "record-form-actions";

    const cancelButton = document.createElement("button");
    cancelButton.className = "cancel-edit-button";
    cancelButton.id = "cancelEditButton";
    cancelButton.type = "button";
    cancelButton.textContent = "取消修改";
    cancelButton.hidden = true;

    recordToolsElements.submitButton.before(actionContainer);
    actionContainer.append(recordToolsElements.submitButton, cancelButton);
    recordToolsElements.cancelButton = cancelButton;

    const editingNotice = document.createElement("div");
    editingNotice.className = "editing-notice";
    editingNotice.id = "editingNotice";
    editingNotice.hidden = true;

    const noticeText = document.createElement("span");
    noticeText.textContent = "正在修改已有记录，保存后将覆盖该记录的原内容。";
    editingNotice.appendChild(noticeText);

    elements.form.prepend(editingNotice);
    recordToolsElements.editingNotice = editingNotice;
}

function enhanceSearchInterface() {
    elements.recordSearch.placeholder = "输入关键词，将按内容相似度从高到低排序";
    elements.recordSearch.setAttribute("aria-describedby", "fuzzySearchHint");

    const hint = document.createElement("small");
    hint.className = "fuzzy-search-hint";
    hint.id = "fuzzySearchHint";
    hint.textContent = "支持关键词拆分、部分匹配和近似匹配，不需要输入完全相同的内容。";
    elements.recordSearch.insertAdjacentElement("afterend", hint);
}

function enhanceExportInterface() {
    elements.exportRecordsButton.textContent = "导出 Word 文档";

    const settingsCards = document.querySelectorAll(".settings-card");
    if (settingsCards.length > 1) {
        const description = settingsCards[1].querySelector("p:not(.eyebrow)");
        if (description) {
            description.textContent = "可将全部实验记录导出为 Word 文档，或清空当前浏览器中的所有实验记录。";
        }
    }
}

function bindRecordToolEvents() {
    document.addEventListener("submit", interceptRecordFormSubmit, true);
    document.addEventListener("click", interceptWordExport, true);
    recordToolsElements.cancelButton.addEventListener("click", cancelRecordEditing);
}

function interceptRecordFormSubmit(event) {
    if (event.target !== elements.form) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    saveRecordFromForm();
}

function saveRecordFromForm() {
    const sampleName = elements.sampleName.value.trim();
    const experimentDate = elements.experimentDate.value;
    const operation = elements.experimentOperation.value.trim();
    const notes = elements.experimentNotes.value.trim();
    const operationTable = typeof cloneOperationTable === "function"
        ? cloneOperationTable(draftOperationTable)
        : [];
    const hasOperationTable = operationTable.length > 0;

    elements.sampleName.setCustomValidity(sampleName ? "" : "请输入样本名称");
    elements.experimentDate.setCustomValidity(experimentDate ? "" : "请选择实验日期");
    elements.experimentOperation.setCustomValidity(
        operation || hasOperationTable ? "" : "请输入实验操作，或粘贴一份 Excel 表格"
    );

    if (!elements.form.checkValidity()) {
        elements.form.reportValidity();
        return;
    }

    if (recordToolsState.editingRecordId) {
        updateExistingRecord({
            sampleName,
            experimentDate,
            operation,
            operationTable,
            notes
        });
        return;
    }

    createNewRecord({
        sampleName,
        experimentDate,
        operation,
        operationTable,
        notes
    });
}

function createNewRecord(recordData) {
    const newRecord = {
        id: createRecordId(),
        ...recordData,
        createdAt: new Date().toISOString(),
        updatedAt: ""
    };

    records.unshift(newRecord);
    if (!saveRecords()) {
        records.shift();
        return;
    }

    resetRecordForm();
    renderApp();
    elements.sampleName.focus();
    showToast(recordData.operationTable.length > 0
        ? "实验记录和 Excel 表格已保存"
        : "实验记录已保存");
}

function updateExistingRecord(recordData) {
    const recordIndex = records.findIndex((record) => record.id === recordToolsState.editingRecordId);
    if (recordIndex < 0) {
        showToast("未找到需要修改的实验记录", true);
        resetRecordForm();
        return;
    }

    const previousRecord = records[recordIndex];
    records[recordIndex] = {
        ...previousRecord,
        ...recordData,
        updatedAt: new Date().toISOString()
    };

    if (!saveRecords()) {
        records[recordIndex] = previousRecord;
        return;
    }

    const recordName = records[recordIndex].sampleName;
    resetRecordForm();
    renderApp();
    showToast(`“${recordName}”已更新`);
}

function startEditingRecord(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record) {
        showToast("未找到该实验记录", true);
        return;
    }

    const hasUnsavedContent = Boolean(
        elements.sampleName.value.trim()
        || elements.experimentOperation.value.trim()
        || elements.experimentNotes.value.trim()
        || (typeof draftOperationTable !== "undefined" && draftOperationTable.length > 0)
    );

    if (hasUnsavedContent
        && recordToolsState.editingRecordId !== recordId
        && !window.confirm("当前表单中有尚未保存的内容，是否放弃并修改所选记录？")) {
        return;
    }

    recordToolsState.editingRecordId = recordId;
    elements.sampleName.value = record.sampleName;
    elements.experimentDate.value = record.experimentDate;
    elements.experimentOperation.value = record.operation || "";
    elements.experimentNotes.value = record.notes || "";

    if (typeof draftOperationTable !== "undefined") {
        draftOperationTable = typeof cloneOperationTable === "function"
            ? cloneOperationTable(record.operationTable)
            : [];
        if (typeof renderDraftOperationTable === "function") {
            renderDraftOperationTable();
        }
    }

    elements.methodSearch.value = "";
    elements.experimentOperation.setCustomValidity("");
    setRecordFormMode(true, record.sampleName);
    switchView("dashboard");

    window.setTimeout(() => {
        document.querySelector(".form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        elements.sampleName.focus();
        elements.sampleName.select();
    }, 180);

    showToast(`正在修改“${record.sampleName}”`);
}

function cancelRecordEditing() {
    resetRecordForm();
    renderApp();
    elements.sampleName.focus();
    showToast("已取消修改");
}

function resetRecordForm() {
    recordToolsState.editingRecordId = null;
    elements.form.reset();
    elements.methodSearch.value = "";
    elements.experimentOperation.setCustomValidity("");

    if (typeof draftOperationTable !== "undefined") {
        draftOperationTable = [];
        if (typeof renderDraftOperationTable === "function") {
            renderDraftOperationTable();
        }
    }

    setDefaultDate();
    setRecordFormMode(false);
}

function setRecordFormMode(isEditing, sampleName = "") {
    if (!recordToolsElements.formTitle) {
        return;
    }

    recordToolsElements.formTitle.textContent = isEditing ? "修改实验记录" : "新建实验记录";
    recordToolsElements.modeBadge.textContent = isEditing ? "编辑中" : "必填";
    recordToolsElements.modeBadge.classList.toggle("editing-badge", isEditing);
    recordToolsElements.submitButton.textContent = isEditing ? "✓ 保存修改" : "＋ 保存实验记录";
    recordToolsElements.cancelButton.hidden = !isEditing;
    recordToolsElements.editingNotice.hidden = !isEditing;

    if (isEditing) {
        recordToolsElements.editingNotice.firstElementChild.textContent =
            `正在修改“${sampleName}”，保存后会更新原记录。`;
    }
}

function overrideRecordCardRenderer() {
    createRecordCard = function createEditableRecordCard(record, compact) {
        const card = document.createElement("article");
        card.className = "record-card";
        card.dataset.recordId = record.id;

        const title = document.createElement("h3");
        title.textContent = record.sampleName;

        const date = document.createElement("time");
        date.className = "record-date";
        date.dateTime = record.experimentDate;
        date.textContent = formatExperimentDate(record.experimentDate);

        const bodyElements = [title, date];

        if (record.operation) {
            const operation = document.createElement("p");
            operation.className = "record-operation";
            operation.textContent = compact ? createSummary(record.operation, 120) : record.operation;
            bodyElements.push(operation);
        }

        const tableData = typeof normalizeOperationTable === "function"
            ? normalizeOperationTable(record.operationTable)
            : [];

        if (tableData.length > 0) {
            if (compact) {
                const tableSummary = document.createElement("p");
                tableSummary.className = "record-table-summary";
                tableSummary.textContent = `▦ Excel 表格 ${tableData.length} 行 × ${tableData[0].length} 列`;
                bodyElements.push(tableSummary);
            } else {
                const tableLabel = document.createElement("p");
                tableLabel.className = "record-table-label";
                tableLabel.textContent = "实验操作表格";
                bodyElements.push(tableLabel, createOperationTableElement(tableData, false));
            }
        }

        if (!compact && record.notes) {
            const notes = document.createElement("p");
            notes.className = "record-notes";
            notes.textContent = `备注：${record.notes}`;
            bodyElements.push(notes);
        }

        if (!compact) {
            const createdAt = document.createElement("p");
            createdAt.className = "record-created";
            createdAt.textContent = record.updatedAt
                ? `创建于 ${formatCreatedTime(record.createdAt)} · 最后修改 ${formatCreatedTime(record.updatedAt)}`
                : `创建于 ${formatCreatedTime(record.createdAt)}`;
            bodyElements.push(createdAt);
        }

        const actions = document.createElement("div");
        actions.className = "record-actions";

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.type = "button";
        editButton.textContent = "修改";
        editButton.setAttribute("aria-label", `修改记录：${record.sampleName}`);
        editButton.addEventListener("click", () => startEditingRecord(record.id));

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.type = "button";
        deleteButton.textContent = "删除";
        deleteButton.setAttribute("aria-label", `删除记录：${record.sampleName}`);
        deleteButton.addEventListener("click", () => {
            const wasEditing = recordToolsState.editingRecordId === record.id;
            deleteRecord(record.id);
            if (wasEditing && !records.some((item) => item.id === record.id)) {
                resetRecordForm();
            }
        });

        actions.append(editButton, deleteButton);
        card.append(...bodyElements, actions);
        return card;
    };
}

function overrideArchiveSearch() {
    renderArchiveRecords = function renderFuzzyArchiveRecords() {
        const query = elements.recordSearch.value.trim();
        const searchResults = query
            ? rankRecordsBySimilarity(query)
            : records.map((record) => ({ record, score: 1 }));

        elements.allRecordsList.replaceChildren();
        elements.archiveEmptyState.hidden = searchResults.length > 0;

        if (!query) {
            elements.allRecordCount.textContent = `${searchResults.length} 条记录`;
        } else if (searchResults.length > 0) {
            elements.allRecordCount.textContent = `找到 ${searchResults.length} 条相关记录，已按相似度排序`;
        } else {
            elements.allRecordCount.textContent = "未找到相关记录";
        }

        searchResults.forEach(({ record, score }) => {
            const card = createRecordCard(record, false);
            if (query) {
                const matchBadge = document.createElement("span");
                matchBadge.className = "search-match-badge";
                matchBadge.textContent = `相似度 ${Math.max(1, Math.round(score * 100))}%`;
                card.appendChild(matchBadge);
            }
            elements.allRecordsList.appendChild(card);
        });
    };
}

function rankRecordsBySimilarity(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return records.map((record) => ({ record, score: 1 }));
    }

    const ranked = records
        .map((record) => ({
            record,
            score: calculateRecordSimilarity(record, normalizedQuery)
        }))
        .sort((a, b) => b.score - a.score
            || new Date(b.record.createdAt) - new Date(a.record.createdAt));

    const meaningfulResults = ranked.filter((item) => item.score >= 0.08);
    if (meaningfulResults.length > 0) {
        return meaningfulResults;
    }

    return ranked.filter((item) => item.score > 0).slice(0, 5);
}

function calculateRecordSimilarity(record, normalizedQuery) {
    const tableText = typeof normalizeOperationTable === "function"
        ? normalizeOperationTable(record.operationTable).flat().join(" ")
        : "";

    const fields = [
        { text: record.sampleName, weight: 3.4 },
        { text: record.operation, weight: 2.4 },
        { text: tableText, weight: 2.1 },
        { text: record.notes, weight: 1.4 },
        { text: record.experimentDate, weight: 1.2 }
    ];

    let weightedScore = 0;
    let totalWeight = 0;

    fields.forEach(({ text, weight }) => {
        const normalizedField = normalizeSearchText(text || "");
        weightedScore += calculateTextSimilarity(normalizedQuery, normalizedField) * weight;
        totalWeight += weight;
    });

    const combinedText = normalizeSearchText(fields.map((field) => field.text || "").join(" "));
    const exactBonus = combinedText.includes(normalizedQuery) ? 0.18 : 0;
    return Math.min(1, weightedScore / totalWeight + exactBonus);
}

function calculateTextSimilarity(query, candidate) {
    if (!candidate) {
        return 0;
    }
    if (candidate === query) {
        return 1;
    }
    if (candidate.includes(query)) {
        return 0.92;
    }

    const queryTokens = createSearchTokens(query);
    const candidateTokens = createSearchTokens(candidate);
    const candidateTokenSet = new Set(candidateTokens);

    let tokenScore = 0;
    queryTokens.forEach((token) => {
        if (candidate.includes(token) || candidateTokenSet.has(token)) {
            tokenScore += 1;
            return;
        }

        const closestTokenScore = candidateTokens.reduce((best, candidateToken) => {
            return Math.max(best, diceCoefficient(token, candidateToken));
        }, 0);

        if (closestTokenScore >= 0.45) {
            tokenScore += closestTokenScore * 0.75;
        }
    });

    const tokenCoverage = queryTokens.length > 0 ? tokenScore / queryTokens.length : 0;
    const phraseSimilarity = diceCoefficient(query.replace(/\s+/g, ""), candidate.replace(/\s+/g, ""));
    return Math.min(1, tokenCoverage * 0.72 + phraseSimilarity * 0.28);
}

function createSearchTokens(text) {
    const tokens = new Set(
        text.split(/\s+/).map((token) => token.trim()).filter(Boolean)
    );

    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
        const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
        for (const segment of segmenter.segment(text)) {
            if (segment.isWordLike && segment.segment.trim()) {
                tokens.add(segment.segment.trim());
            }
        }
    }

    const chineseChunks = text.match(/[\u3400-\u9fff]+/g) || [];
    chineseChunks.forEach((chunk) => {
        tokens.add(chunk);
        if (chunk.length > 1) {
            for (let index = 0; index < chunk.length - 1; index += 1) {
                tokens.add(chunk.slice(index, index + 2));
            }
        }
    });

    return [...tokens].filter((token) => token.length > 0);
}

function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function diceCoefficient(firstValue, secondValue) {
    const first = String(firstValue || "");
    const second = String(secondValue || "");

    if (!first || !second) {
        return 0;
    }
    if (first === second) {
        return 1;
    }
    if (first.length === 1 || second.length === 1) {
        return first.includes(second) || second.includes(first) ? 0.7 : 0;
    }

    const firstBigrams = createBigrams(first);
    const secondBigrams = createBigrams(second);
    const secondCounts = new Map();

    secondBigrams.forEach((bigram) => {
        secondCounts.set(bigram, (secondCounts.get(bigram) || 0) + 1);
    });

    let intersection = 0;
    firstBigrams.forEach((bigram) => {
        const count = secondCounts.get(bigram) || 0;
        if (count > 0) {
            intersection += 1;
            secondCounts.set(bigram, count - 1);
        }
    });

    return (2 * intersection) / (firstBigrams.length + secondBigrams.length);
}

function createBigrams(text) {
    const compactText = text.replace(/\s+/g, "");
    const bigrams = [];
    for (let index = 0; index < compactText.length - 1; index += 1) {
        bigrams.push(compactText.slice(index, index + 2));
    }
    return bigrams;
}

function interceptWordExport(event) {
    const exportButton = event.target.closest("#exportRecordsButton");
    if (!exportButton) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    exportRecordsAsWord();
}

function exportRecordsAsWord() {
    if (records.length === 0) {
        showToast("暂无可导出的实验记录", true);
        return;
    }

    const wordContent = buildWordDocument(records);
    const blob = new Blob(["\ufeff", wordContent], {
        type: "application/msword;charset=utf-8"
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = `LabNote实验记录-${getLocalDateString(new Date())}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    showToast("Word 实验记录已导出");
}

function buildWordDocument(recordList) {
    const exportedAt = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date());

    const recordSections = recordList.map((record, index) => {
        const tableHtml = buildWordTable(record.operationTable);
        const operationHtml = record.operation
            ? `<div class="content">${formatTextForWord(record.operation)}</div>`
            : '<div class="content muted">无文字操作说明</div>';
        const notesHtml = record.notes
            ? `<div class="content">${formatTextForWord(record.notes)}</div>`
            : '<div class="content muted">无</div>';
        const updatedText = record.updatedAt
            ? `<p><strong>最后修改：</strong>${escapeHtml(formatCreatedTime(record.updatedAt))}</p>`
            : "";

        return `
            <section class="record">
                <h2>${index + 1}. ${escapeHtml(record.sampleName)}</h2>
                <div class="meta">
                    <p><strong>实验日期：</strong>${escapeHtml(formatExperimentDate(record.experimentDate))}</p>
                    <p><strong>创建时间：</strong>${escapeHtml(formatCreatedTime(record.createdAt))}</p>
                    ${updatedText}
                </div>
                <h3>实验操作</h3>
                ${operationHtml}
                ${tableHtml}
                <h3>实验备注</h3>
                ${notesHtml}
            </section>
        `;
    }).join("");

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>LabNote 实验记录</title>
<style>
@page { size: A4; margin: 2cm; }
body { font-family: "Microsoft YaHei", "SimSun", sans-serif; color: #172033; line-height: 1.6; }
h1 { font-size: 24pt; margin: 0 0 8pt; color: #332c87; }
h2 { font-size: 16pt; margin: 20pt 0 8pt; padding-bottom: 5pt; border-bottom: 1pt solid #cfd4e5; }
h3 { font-size: 12pt; margin: 12pt 0 5pt; color: #4f46e5; }
p { margin: 3pt 0; }
.cover { margin-bottom: 24pt; }
.summary { color: #68738a; }
.record { page-break-inside: avoid; margin-bottom: 18pt; }
.meta { padding: 8pt 10pt; background: #f3f5fb; }
.content { white-space: pre-wrap; margin: 5pt 0 10pt; }
.muted { color: #929bad; }
table { width: 100%; border-collapse: collapse; margin: 7pt 0 12pt; }
td { border: 1pt solid #bfc6d8; padding: 5pt; vertical-align: top; }
tr:first-child td { background: #eeedff; font-weight: bold; }
</style>
</head>
<body>
    <div class="cover">
        <h1>LabNote 实验记录</h1>
        <p class="summary">记录数量：${recordList.length} 条</p>
        <p class="summary">导出时间：${escapeHtml(exportedAt)}</p>
    </div>
    ${recordSections}
</body>
</html>`;
}

function buildWordTable(tableValue) {
    const tableData = typeof normalizeOperationTable === "function"
        ? normalizeOperationTable(tableValue)
        : [];

    if (tableData.length === 0) {
        return "";
    }

    const rows = tableData.map((row) => {
        const cells = row.map((cell) => `<td>${formatTextForWord(cell)}</td>`).join("");
        return `<tr>${cells}</tr>`;
    }).join("");

    return `<table>${rows}</table>`;
}

function formatTextForWord(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
