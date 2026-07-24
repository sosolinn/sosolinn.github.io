"use strict";

const STORAGE_KEY = "labnote.records.v2";
const VIEW_NAMES = {
    dashboard: "工作台",
    records: "实验记录",
    statistics: "数据统计",
    settings: "设置"
};

const elements = {
    navButtons: document.querySelectorAll(".nav-button"),
    viewPanels: document.querySelectorAll("[data-view-panel]"),
    viewBreadcrumb: document.getElementById("viewBreadcrumb"),
    currentDate: document.getElementById("currentDate"),
    form: document.getElementById("recordForm"),
    sampleName: document.getElementById("sampleName"),
    experimentDate: document.getElementById("experimentDate"),
    experimentOperation: document.getElementById("experimentOperation"),
    experimentNotes: document.getElementById("experimentNotes"),
    recordsList: document.getElementById("recordsList"),
    emptyState: document.getElementById("emptyState"),
    recordCountLabel: document.getElementById("recordCountLabel"),
    allRecordsList: document.getElementById("allRecordsList"),
    archiveEmptyState: document.getElementById("archiveEmptyState"),
    allRecordCount: document.getElementById("allRecordCount"),
    recordSearch: document.getElementById("recordSearch"),
    totalRecords: document.getElementById("totalRecords"),
    weeklyRecords: document.getElementById("weeklyRecords"),
    latestExperimentDate: document.getElementById("latestExperimentDate"),
    statisticsTotal: document.getElementById("statisticsTotal"),
    statisticsWeekly: document.getElementById("statisticsWeekly"),
    statisticsSamples: document.getElementById("statisticsSamples"),
    monthlyChart: document.getElementById("monthlyChart"),
    sampleBreakdown: document.getElementById("sampleBreakdown"),
    storageRecordCount: document.getElementById("storageRecordCount"),
    storageSize: document.getElementById("storageSize"),
    exportRecordsButton: document.getElementById("exportRecordsButton"),
    clearRecordsButton: document.getElementById("clearRecordsButton"),
    toast: document.getElementById("toast")
};

let records = loadRecords();
let toastTimer;

initializeApp();

function initializeApp() {
    elements.currentDate.textContent = new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short"
    }).format(new Date());

    setDefaultDate();
    bindEvents();
    renderApp();
}

function bindEvents() {
    elements.navButtons.forEach((button) => {
        button.addEventListener("click", () => switchView(button.dataset.view));
    });

    document.querySelectorAll("[data-go-view]").forEach((button) => {
        button.addEventListener("click", () => switchView(button.dataset.goView));
    });

    elements.form.addEventListener("submit", handleFormSubmit);
    elements.recordSearch.addEventListener("input", renderArchiveRecords);
    elements.exportRecordsButton.addEventListener("click", exportRecords);
    elements.clearRecordsButton.addEventListener("click", clearAllRecords);

    [elements.sampleName, elements.experimentDate, elements.experimentOperation].forEach((field) => {
        field.addEventListener("input", () => field.setCustomValidity(""));
    });
}

function switchView(viewName) {
    if (!VIEW_NAMES[viewName]) {
        return;
    }

    elements.navButtons.forEach((button) => {
        const isActive = button.dataset.view === viewName;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    elements.viewPanels.forEach((panel) => {
        const isActive = panel.dataset.viewPanel === viewName;
        panel.hidden = !isActive;
        panel.classList.toggle("active", isActive);
    });

    elements.viewBreadcrumb.textContent = VIEW_NAMES[viewName];

    if (viewName === "records") {
        renderArchiveRecords();
        elements.recordSearch.focus();
    } else if (viewName === "statistics") {
        renderStatistics();
    } else if (viewName === "settings") {
        renderSettings();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadRecords() {
    try {
        const storedValue = localStorage.getItem(STORAGE_KEY);
        if (!storedValue) {
            return [];
        }

        const parsedValue = JSON.parse(storedValue);
        if (!Array.isArray(parsedValue)) {
            return [];
        }

        return parsedValue
            .filter((record) => record && typeof record === "object")
            .map(normalizeRecord)
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.warn("读取本地记录失败：", error);
        return [];
    }
}

function normalizeRecord(record) {
    if (!record.sampleName || !record.experimentDate) {
        return null;
    }

    return {
        id: String(record.id || createRecordId()),
        sampleName: String(record.sampleName),
        experimentDate: String(record.experimentDate),
        operation: String(record.operation || "未记录实验操作"),
        notes: String(record.notes || ""),
        createdAt: String(record.createdAt || new Date().toISOString())
    };
}

function saveRecords() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        return true;
    } catch (error) {
        console.error("保存本地记录失败：", error);
        showToast("保存失败，请检查浏览器存储权限", true);
        return false;
    }
}

function handleFormSubmit(event) {
    event.preventDefault();

    const sampleName = elements.sampleName.value.trim();
    const experimentDate = elements.experimentDate.value;
    const operation = elements.experimentOperation.value.trim();
    const notes = elements.experimentNotes.value.trim();

    elements.sampleName.setCustomValidity(sampleName ? "" : "请输入样本名称");
    elements.experimentDate.setCustomValidity(experimentDate ? "" : "请选择实验日期");
    elements.experimentOperation.setCustomValidity(operation ? "" : "请输入实验操作");

    if (!elements.form.checkValidity()) {
        elements.form.reportValidity();
        return;
    }

    const newRecord = {
        id: createRecordId(),
        sampleName,
        experimentDate,
        operation,
        notes,
        createdAt: new Date().toISOString()
    };

    records.unshift(newRecord);
    if (!saveRecords()) {
        records.shift();
        return;
    }

    elements.form.reset();
    setDefaultDate();
    renderApp();
    elements.sampleName.focus();
    showToast("实验记录已保存");
}

function createRecordId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderApp() {
    renderDashboardRecords();
    renderArchiveRecords();
    renderStatistics();
    renderSettings();
}

function renderDashboardRecords() {
    elements.recordsList.replaceChildren();
    elements.recordCountLabel.textContent = `${records.length} 条记录`;
    elements.emptyState.hidden = records.length > 0;

    records.slice(0, 5).forEach((record) => {
        elements.recordsList.appendChild(createRecordCard(record, true));
    });

    elements.totalRecords.textContent = String(records.length);
    elements.weeklyRecords.textContent = String(countRecordsCreatedThisWeek());
    elements.latestExperimentDate.textContent = getLatestExperimentDate();
}

function renderArchiveRecords() {
    const keyword = elements.recordSearch.value.trim().toLocaleLowerCase("zh-CN");
    const filteredRecords = records.filter((record) => {
        const haystack = `${record.sampleName} ${record.experimentDate} ${record.operation} ${record.notes}`.toLocaleLowerCase("zh-CN");
        return haystack.includes(keyword);
    });

    elements.allRecordsList.replaceChildren();
    elements.archiveEmptyState.hidden = filteredRecords.length > 0;
    elements.allRecordCount.textContent = keyword
        ? `找到 ${filteredRecords.length} 条记录`
        : `${filteredRecords.length} 条记录`;

    filteredRecords.forEach((record) => {
        elements.allRecordsList.appendChild(createRecordCard(record, false));
    });
}

function createRecordCard(record, compact) {
    const card = document.createElement("article");
    card.className = "record-card";

    const title = document.createElement("h3");
    title.textContent = record.sampleName;

    const date = document.createElement("time");
    date.className = "record-date";
    date.dateTime = record.experimentDate;
    date.textContent = formatExperimentDate(record.experimentDate);

    const operation = document.createElement("p");
    operation.className = "record-operation";
    operation.textContent = compact ? createSummary(record.operation, 120) : record.operation;

    const bodyElements = [title, date, operation];

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
}

function deleteRecord(recordId) {
    const record = records.find((item) => item.id === recordId);
    if (!record || !window.confirm(`确定删除“${record.sampleName}”这条实验记录吗？`)) {
        return;
    }

    const previousRecords = records;
    records = records.filter((item) => item.id !== recordId);

    if (!saveRecords()) {
        records = previousRecords;
        return;
    }

    renderApp();
    showToast("实验记录已删除");
}

function renderStatistics() {
    const weeklyCount = countRecordsCreatedThisWeek();
    const uniqueSamples = new Set(records.map((record) => record.sampleName.trim().toLocaleLowerCase("zh-CN"))).size;

    elements.statisticsTotal.textContent = String(records.length);
    elements.statisticsWeekly.textContent = String(weeklyCount);
    elements.statisticsSamples.textContent = String(uniqueSamples);
    renderMonthlyChart();
    renderSampleBreakdown();
}

function renderMonthlyChart() {
    const months = getRecentMonths(6);
    const counts = months.map(({ year, month }) => records.filter((record) => {
        const date = new Date(`${record.experimentDate}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month;
    }).length);
    const maxCount = Math.max(...counts, 1);

    elements.monthlyChart.replaceChildren();
    months.forEach((monthInfo, index) => {
        const item = document.createElement("div");
        item.className = "bar-item";

        const track = document.createElement("div");
        track.className = "bar-track";

        const fill = document.createElement("div");
        fill.className = "bar-fill";
        fill.style.height = `${Math.max((counts[index] / maxCount) * 100, counts[index] ? 8 : 2)}%`;
        fill.setAttribute("aria-label", `${monthInfo.label}：${counts[index]} 条记录`);

        const value = document.createElement("span");
        value.textContent = String(counts[index]);
        fill.appendChild(value);
        track.appendChild(fill);

        const label = document.createElement("div");
        label.className = "bar-label";
        label.textContent = monthInfo.label;

        item.append(track, label);
        elements.monthlyChart.appendChild(item);
    });
}

function renderSampleBreakdown() {
    elements.sampleBreakdown.replaceChildren();

    if (records.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "breakdown-empty";
        emptyMessage.textContent = "保存实验记录后，这里会显示常用样本。";
        elements.sampleBreakdown.appendChild(emptyMessage);
        return;
    }

    const counts = new Map();
    records.forEach((record) => {
        counts.set(record.sampleName, (counts.get(record.sampleName) || 0) + 1);
    });

    const rankedSamples = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxCount = rankedSamples[0][1];

    rankedSamples.forEach(([sampleName, count]) => {
        const row = document.createElement("div");
        row.className = "breakdown-row";

        const meta = document.createElement("div");
        meta.className = "breakdown-meta";

        const name = document.createElement("span");
        name.textContent = sampleName;
        const value = document.createElement("span");
        value.textContent = `${count} 次`;
        meta.append(name, value);

        const track = document.createElement("div");
        track.className = "progress-track";
        const progress = document.createElement("div");
        progress.className = "progress-value";
        progress.style.width = `${(count / maxCount) * 100}%`;
        track.appendChild(progress);

        row.append(meta, track);
        elements.sampleBreakdown.appendChild(row);
    });
}

function renderSettings() {
    const storedText = JSON.stringify(records);
    const sizeInBytes = new Blob([storedText]).size;
    const sizeInKb = sizeInBytes / 1024;

    elements.storageRecordCount.textContent = String(records.length);
    elements.storageSize.textContent = `${sizeInKb < 0.1 ? "< 0.1" : sizeInKb.toFixed(1)} KB`;
    elements.exportRecordsButton.disabled = records.length === 0;
    elements.clearRecordsButton.disabled = records.length === 0;
}

function exportRecords() {
    if (records.length === 0) {
        return;
    }

    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `labnote-backup-${getLocalDateString(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    showToast("JSON 备份已导出");
}

function clearAllRecords() {
    if (records.length === 0 || !window.confirm("确定清空全部实验记录吗？此操作无法撤销。")) {
        return;
    }

    const previousRecords = records;
    records = [];

    if (!saveRecords()) {
        records = previousRecords;
        return;
    }

    elements.recordSearch.value = "";
    renderApp();
    showToast("全部实验记录已清空");
}

function countRecordsCreatedThisWeek() {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);

    return records.filter((record) => {
        const createdAt = new Date(record.createdAt);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= startOfWeek;
    }).length;
}

function getLatestExperimentDate() {
    if (records.length === 0) {
        return "暂无";
    }

    const latestDate = records.reduce((latest, record) => {
        return record.experimentDate > latest ? record.experimentDate : latest;
    }, "");
    return formatExperimentDate(latestDate);
}

function getRecentMonths(amount) {
    const result = [];
    const formatter = new Intl.DateTimeFormat("zh-CN", { month: "short" });
    const current = new Date();
    current.setDate(1);

    for (let offset = amount - 1; offset >= 0; offset -= 1) {
        const date = new Date(current.getFullYear(), current.getMonth() - offset, 1);
        result.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            label: formatter.format(date)
        });
    }
    return result;
}

function createSummary(text, maximumLength) {
    if (text.length <= maximumLength) {
        return text;
    }
    return `${text.slice(0, maximumLength).trim()}…`;
}

function formatExperimentDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return dateString;
    }
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatCreatedTime(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "未知时间";
    }
    return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(date);
}

function setDefaultDate() {
    elements.experimentDate.value = getLocalDateString(new Date());
}

function getLocalDateString(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
}
