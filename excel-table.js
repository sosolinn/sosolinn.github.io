"use strict";

const EXCEL_TABLE_LIMITS = {
    rows: 100,
    columns: 30,
    cellLength: 500
};

const excelElements = {
    pasteZone: document.getElementById("excelPasteZone"),
    preview: document.getElementById("excelTablePreview"),
    status: document.getElementById("excelTableStatus"),
    clearButton: document.getElementById("clearExcelTableButton"),
    methodPreviewTable: document.getElementById("methodPreviewTable")
};

let draftOperationTable = [];

initializeExcelTableSupport();

function initializeExcelTableSupport() {
    if (!excelElements.pasteZone || !excelElements.preview || !excelElements.status || !excelElements.clearButton) {
        console.warn("Excel 表格组件未找到，相关功能未启用。");
        return;
    }

    patchRecordNormalizer();
    restoreOperationTablesFromStorage();
    patchRecordRendering();
    patchMethodReuse();
    bindExcelTableEvents();

    elements.experimentOperation.removeAttribute("required");
    elements.form.addEventListener("submit", handleEnhancedFormSubmit, true);

    renderDraftOperationTable();
    renderApp();
}

function patchRecordNormalizer() {
    const originalNormalizeRecord = normalizeRecord;
    normalizeRecord = function enhancedNormalizeRecord(record) {
        const normalizedRecord = originalNormalizeRecord(record);
        if (!normalizedRecord) {
            return null;
        }
        normalizedRecord.operationTable = normalizeOperationTable(record.operationTable);
        return normalizedRecord;
    };
}

function restoreOperationTablesFromStorage() {
    try {
        const rawRecords = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(rawRecords)) {
            return;
        }

        const tablesById = new Map(rawRecords.map((record) => [
            String(record.id || ""),
            normalizeOperationTable(record.operationTable)
        ]));

        records = records.map((record) => ({
            ...record,
            operationTable: tablesById.get(record.id) || []
        }));
    } catch (error) {
        console.warn("恢复实验操作表格失败：", error);
        records = records.map((record) => ({ ...record, operationTable: [] }));
    }
}

function bindExcelTableEvents() {
    excelElements.pasteZone.addEventListener("click", () => excelElements.pasteZone.focus());
    excelElements.pasteZone.addEventListener("paste", handlePasteZonePaste);
    excelElements.pasteZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            excelElements.pasteZone.focus();
            showToast("请在 Excel 复制单元格后按 Ctrl + V");
        }
    });

    elements.experimentOperation.addEventListener("paste", handleOperationTextareaPaste);
    elements.recordSearch.addEventListener("input", () => renderArchiveRecords());
    elements.methodSearch.addEventListener("input", () => renderMethodTemplates());
    elements.methodTemplateSelect.addEventListener("change", () => updateMethodPreview());
    elements.copyOperationButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        copySelectedOperation();
    }, true);
    excelElements.clearButton.addEventListener("click", clearDraftOperationTable);
    excelElements.preview.addEventListener("input", handleEditableCellInput);
    excelElements.preview.addEventListener("paste", handleEditableCellPaste);
}

function handlePasteZonePaste(event) {
    event.preventDefault();
    importClipboardTable(event.clipboardData?.getData("text/plain") || "");
}

function handleOperationTextareaPaste(event) {
    const clipboardText = event.clipboardData?.getData("text/plain") || "";
    if (!clipboardText.includes("\t")) {
        return;
    }

    const parsedTable = tryParseClipboardTable(clipboardText, false);
    if (!parsedTable) {
        return;
    }

    event.preventDefault();
    applyDraftOperationTable(parsedTable);
}

function importClipboardTable(clipboardText) {
    const parsedTable = tryParseClipboardTable(clipboardText, true);
    if (!parsedTable) {
        showToast("未识别到 Excel 表格，请先复制一个包含多行或多列的单元格区域", true);
        return;
    }
    applyDraftOperationTable(parsedTable);
}

function tryParseClipboardTable(text, showErrors) {
    try {
        return parseClipboardTable(text);
    } catch (error) {
        if (showErrors) {
            showToast(error.message || "表格内容无法解析", true);
        }
        return null;
    }
}

function parseClipboardTable(text) {
    if (!text.trim()) {
        return null;
    }

    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const nextCharacter = text[index + 1];

        if (character === '"') {
            if (insideQuotes && nextCharacter === '"') {
                cell += '"';
                index += 1;
            } else {
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if (character === "\t" && !insideQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((character === "\n" || character === "\r") && !insideQuotes) {
            if (character === "\r" && nextCharacter === "\n") {
                index += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += character;
    }

    row.push(cell);
    rows.push(row);

    const normalizedTable = normalizeOperationTable(rows);
    if (normalizedTable.length === 0) {
        return null;
    }

    const columnCount = normalizedTable[0].length;
    if (normalizedTable.length === 1 && columnCount === 1) {
        return null;
    }

    if (normalizedTable.length > EXCEL_TABLE_LIMITS.rows) {
        throw new Error(`表格最多支持 ${EXCEL_TABLE_LIMITS.rows} 行`);
    }
    if (columnCount > EXCEL_TABLE_LIMITS.columns) {
        throw new Error(`表格最多支持 ${EXCEL_TABLE_LIMITS.columns} 列`);
    }

    return normalizedTable;
}

function normalizeOperationTable(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const rows = value
        .slice(0, EXCEL_TABLE_LIMITS.rows)
        .filter(Array.isArray)
        .map((row) => row
            .slice(0, EXCEL_TABLE_LIMITS.columns)
            .map((cell) => String(cell ?? "").slice(0, EXCEL_TABLE_LIMITS.cellLength)));

    while (rows.length > 0 && rows[rows.length - 1].every((cell) => !cell.trim())) {
        rows.pop();
    }
    if (rows.length === 0) {
        return [];
    }

    let lastUsedColumn = -1;
    rows.forEach((row) => {
        row.forEach((cell, columnIndex) => {
            if (cell.trim()) {
                lastUsedColumn = Math.max(lastUsedColumn, columnIndex);
            }
        });
    });
    if (lastUsedColumn < 0) {
        return [];
    }

    const columnCount = lastUsedColumn + 1;
    return rows.map((row) => {
        const normalizedRow = row.slice(0, columnCount);
        while (normalizedRow.length < columnCount) {
            normalizedRow.push("");
        }
        return normalizedRow;
    });
}

function applyDraftOperationTable(table) {
    if (draftOperationTable.length > 0 && !window.confirm("当前已粘贴一个表格，是否使用新表格替换？")) {
        return;
    }

    draftOperationTable = cloneOperationTable(table);
    elements.experimentOperation.setCustomValidity("");
    renderDraftOperationTable();
    showToast(`已识别 ${table.length} 行 × ${table[0].length} 列，可直接编辑单元格`);
}

function clearDraftOperationTable() {
    if (draftOperationTable.length === 0) {
        return;
    }
    draftOperationTable = [];
    renderDraftOperationTable();
    showToast("已移除 Excel 表格");
}

function renderDraftOperationTable() {
    excelElements.preview.replaceChildren();
    const hasTable = draftOperationTable.length > 0;

    excelElements.preview.hidden = !hasTable;
    excelElements.clearButton.disabled = !hasTable;
    excelElements.pasteZone.classList.toggle("has-table", hasTable);

    if (!hasTable) {
        excelElements.status.textContent = "尚未添加表格";
        return;
    }

    excelElements.status.textContent = `${draftOperationTable.length} 行 × ${draftOperationTable[0].length} 列`;
    excelElements.preview.appendChild(createOperationTableElement(draftOperationTable, true));
}

function createOperationTableElement(tableData, editable) {
    const wrapper = document.createElement("div");
    wrapper.className = editable ? "excel-table-scroll editable-table" : "excel-table-scroll record-table-scroll";

    const table = document.createElement("table");
    table.className = "excel-data-table";

    const body = document.createElement("tbody");
    tableData.forEach((row, rowIndex) => {
        const tableRow = document.createElement("tr");
        row.forEach((cellValue, columnIndex) => {
            const cell = document.createElement("td");
            cell.textContent = cellValue;
            if (editable) {
                cell.contentEditable = "plaintext-only";
                cell.spellcheck = false;
                cell.dataset.row = String(rowIndex);
                cell.dataset.column = String(columnIndex);
                cell.setAttribute("aria-label", `第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列`);
            }
            tableRow.appendChild(cell);
        });
        body.appendChild(tableRow);
    });

    table.appendChild(body);
    wrapper.appendChild(table);
    return wrapper;
}

function handleEditableCellInput(event) {
    const cell = event.target.closest("td[data-row][data-column]");
    if (!cell) {
        return;
    }

    const rowIndex = Number(cell.dataset.row);
    const columnIndex = Number(cell.dataset.column);
    const safeValue = cell.textContent.slice(0, EXCEL_TABLE_LIMITS.cellLength);
    if (cell.textContent !== safeValue) {
        cell.textContent = safeValue;
    }
    draftOperationTable[rowIndex][columnIndex] = safeValue;
}

function handleEditableCellPaste(event) {
    const cell = event.target.closest("td[data-row][data-column]");
    if (!cell) {
        return;
    }

    const clipboardText = event.clipboardData?.getData("text/plain") || "";
    const pastedTable = tryParseClipboardTable(clipboardText, false);
    if (pastedTable) {
        event.preventDefault();
        applyDraftOperationTable(pastedTable);
        return;
    }

    event.preventDefault();
    const safeText = clipboardText.replace(/[\r\n]+/g, " ").slice(0, EXCEL_TABLE_LIMITS.cellLength);
    cell.textContent = safeText;
    draftOperationTable[Number(cell.dataset.row)][Number(cell.dataset.column)] = safeText;
}

function handleEnhancedFormSubmit(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const sampleName = elements.sampleName.value.trim();
    const experimentDate = elements.experimentDate.value;
    const operation = elements.experimentOperation.value.trim();
    const notes = elements.experimentNotes.value.trim();
    const hasOperationTable = draftOperationTable.length > 0;

    elements.sampleName.setCustomValidity(sampleName ? "" : "请输入样本名称");
    elements.experimentDate.setCustomValidity(experimentDate ? "" : "请选择实验日期");
    elements.experimentOperation.setCustomValidity(
        operation || hasOperationTable ? "" : "请输入实验操作，或粘贴一份 Excel 表格"
    );

    if (!elements.form.checkValidity()) {
        elements.form.reportValidity();
        return;
    }

    const newRecord = {
        id: createRecordId(),
        sampleName,
        experimentDate,
        operation,
        operationTable: cloneOperationTable(draftOperationTable),
        notes,
        createdAt: new Date().toISOString()
    };

    records.unshift(newRecord);
    if (!saveRecords()) {
        records.shift();
        return;
    }

    elements.form.reset();
    elements.methodSearch.value = "";
    elements.experimentOperation.setCustomValidity("");
    draftOperationTable = [];
    setDefaultDate();
    renderDraftOperationTable();
    renderApp();
    elements.sampleName.focus();
    showToast(hasOperationTable ? "实验记录和 Excel 表格已保存" : "实验记录已保存");
}

function patchRecordRendering() {
    createRecordCard = function createEnhancedRecordCard(record, compact) {
        const card = document.createElement("article");
        card.className = "record-card";

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

        const tableData = normalizeOperationTable(record.operationTable);
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
            createdAt.textContent = `创建于 ${formatCreatedTime(record.createdAt)}`;
            bodyElements.push(createdAt);
        }

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.type = "button";
        deleteButton.textContent = "删除";
        deleteButton.setAttribute("aria-label", `删除记录：${record.sampleName}`);
        deleteButton.addEventListener("click", () => deleteRecord(record.id));

        card.append(...bodyElements, deleteButton);
        return card;
    };

    renderArchiveRecords = function renderEnhancedArchiveRecords() {
        const keyword = elements.recordSearch.value.trim().toLocaleLowerCase("zh-CN");
        const filteredRecords = records.filter((record) => getRecordSearchText(record).includes(keyword));

        elements.allRecordsList.replaceChildren();
        elements.archiveEmptyState.hidden = filteredRecords.length > 0;
        elements.allRecordCount.textContent = keyword
            ? `找到 ${filteredRecords.length} 条记录`
            : `${filteredRecords.length} 条记录`;

        filteredRecords.forEach((record) => {
            elements.allRecordsList.appendChild(createRecordCard(record, false));
        });
    };
}

function getRecordSearchText(record) {
    const tableText = normalizeOperationTable(record.operationTable).flat().join(" ");
    return `${record.sampleName} ${record.experimentDate} ${record.operation} ${tableText} ${record.notes}`
        .toLocaleLowerCase("zh-CN");
}

function patchMethodReuse() {
    getReusableMethodRecords = function getEnhancedReusableMethodRecords() {
        const seenMethods = new Set();

        return records.filter((record) => {
            const tableData = normalizeOperationTable(record.operationTable);
            const operation = record.operation.trim();
            if ((!operation || operation === "未记录实验操作") && tableData.length === 0) {
                return false;
            }

            const normalizedOperation = operation.replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
            const signature = `${normalizedOperation}|${JSON.stringify(tableData)}`;
            if (seenMethods.has(signature)) {
                return false;
            }

            seenMethods.add(signature);
            return true;
        });
    };

    renderMethodTemplates = function renderEnhancedMethodTemplates() {
        const reusableRecords = getReusableMethodRecords();
        const keyword = elements.methodSearch.value.trim().toLocaleLowerCase("zh-CN");
        const selectedId = elements.methodTemplateSelect.value;
        const filteredRecords = reusableRecords.filter((record) => getRecordSearchText(record).includes(keyword));

        elements.methodTemplateSelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = reusableRecords.length === 0
            ? "保存实验记录后可复用方法"
            : filteredRecords.length === 0
                ? "没有匹配的历史方法"
                : "请选择一条历史实验记录";
        elements.methodTemplateSelect.appendChild(placeholder);

        filteredRecords.forEach((record) => {
            const option = document.createElement("option");
            option.value = record.id;
            option.textContent = `${record.sampleName} · ${formatExperimentDate(record.experimentDate)} · ${createMethodSummary(record)}`;
            elements.methodTemplateSelect.appendChild(option);
        });

        const canSearch = reusableRecords.length > 0;
        elements.methodSearch.disabled = !canSearch;
        elements.methodTemplateSelect.disabled = filteredRecords.length === 0;
        elements.methodTemplateCount.textContent = keyword
            ? `找到 ${filteredRecords.length} 个方法`
            : `${reusableRecords.length} 个可用方法`;

        if (filteredRecords.some((record) => record.id === selectedId)) {
            elements.methodTemplateSelect.value = selectedId;
        }
        updateMethodPreview();
    };

    updateMethodPreview = function updateEnhancedMethodPreview() {
        const selectedRecord = records.find((record) => record.id === elements.methodTemplateSelect.value);
        const tableData = selectedRecord ? normalizeOperationTable(selectedRecord.operationTable) : [];

        if (!selectedRecord) {
            elements.methodPreview.hidden = true;
            elements.copyOperationButton.disabled = true;
            elements.methodPreviewTitle.textContent = "";
            elements.methodPreviewDate.textContent = "";
            elements.methodPreviewText.textContent = "";
            if (excelElements.methodPreviewTable) {
                excelElements.methodPreviewTable.hidden = true;
                excelElements.methodPreviewTable.replaceChildren();
            }
            return;
        }

        elements.methodPreviewTitle.textContent = selectedRecord.sampleName;
        elements.methodPreviewDate.textContent = formatExperimentDate(selectedRecord.experimentDate);
        elements.methodPreviewText.textContent = selectedRecord.operation || "此历史方法仅包含 Excel 表格。";
        elements.methodPreview.hidden = false;
        elements.copyOperationButton.disabled = false;

        if (excelElements.methodPreviewTable) {
            excelElements.methodPreviewTable.replaceChildren();
            excelElements.methodPreviewTable.hidden = tableData.length === 0;
            if (tableData.length > 0) {
                excelElements.methodPreviewTable.appendChild(createOperationTableElement(tableData, false));
            }
        }
    };

    copySelectedOperation = function copyEnhancedSelectedOperation() {
        const selectedRecord = records.find((record) => record.id === elements.methodTemplateSelect.value);
        if (!selectedRecord) {
            return;
        }

        const selectedTable = normalizeOperationTable(selectedRecord.operationTable);
        const hasCurrentContent = elements.experimentOperation.value.trim() || draftOperationTable.length > 0;
        if (hasCurrentContent && !window.confirm("当前实验操作已有文字或表格，是否使用所选历史方法覆盖？")) {
            return;
        }

        elements.experimentOperation.value = selectedRecord.operation;
        draftOperationTable = cloneOperationTable(selectedTable);
        elements.experimentOperation.setCustomValidity("");
        renderDraftOperationTable();
        elements.experimentOperation.focus();
        showToast(`已复制“${selectedRecord.sampleName}”的实验操作，可继续修改`);
    };
}

function createMethodSummary(record) {
    if (record.operation) {
        return createSummary(record.operation.replace(/\s+/g, " "), 34);
    }
    const tableData = normalizeOperationTable(record.operationTable);
    return tableData.length > 0 ? `Excel 表格 ${tableData.length}×${tableData[0].length}` : "实验方法";
}

function cloneOperationTable(tableData) {
    return normalizeOperationTable(tableData).map((row) => [...row]);
}
