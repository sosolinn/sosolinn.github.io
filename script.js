"use strict";

const STORAGE_KEY = "labnote.records.v1";

const elements = {
    form: document.getElementById("recordForm"),
    sampleName: document.getElementById("sampleName"),
    experimentDate: document.getElementById("experimentDate"),
    experimentNotes: document.getElementById("experimentNotes"),
    noteCount: document.getElementById("noteCount"),
    recordsList: document.getElementById("recordsList"),
    emptyState: document.getElementById("emptyState"),
    totalRecords: document.getElementById("totalRecords"),
    weeklyRecords: document.getElementById("weeklyRecords"),
    latestExperimentDate: document.getElementById("latestExperimentDate"),
    recordCountLabel: document.getElementById("recordCountLabel"),
    currentDate: document.getElementById("currentDate"),
    clearRecordsButton: document.getElementById("clearRecordsButton"),
    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage")
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
    updateNoteCount();
    renderApp();

    elements.form.addEventListener("submit", handleFormSubmit);
    elements.experimentNotes.addEventListener("input", updateNoteCount);
    elements.sampleName.addEventListener("input", clearCustomValidity);
    elements.experimentNotes.addEventListener("input", clearCustomValidity);
    elements.experimentDate.addEventListener("input", clearCustomValidity);
    elements.recordsList.addEventListener("click", handleRecordListClick);
    elements.clearRecordsButton.addEventListener("click", clearAllRecords);
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.addEventListener("click", handleNavigationClick);
    });
}

function loadRecords() {
    try {
        const savedValue = localStorage.getItem(STORAGE_KEY);
        if (!savedValue) {
            return [];
        }

        const parsedValue = JSON.parse(savedValue);
        if (!Array.isArray(parsedValue)) {
            return [];
        }

        return parsedValue
            .filter(isValidRecord)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.warn("读取本地实验记录失败：", error);
        return [];
    }
}

function isValidRecord(record) {
    return Boolean(
        record &&
        typeof record.id === "string" &&
        typeof record.sampleName === "string" &&
        typeof record.experimentDate === "string" &&
        typeof record.notes === "string" &&
        typeof record.createdAt === "string"
    );
}

function saveRecords() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        return true;
    } catch (error) {
        console.error("保存实验记录失败：", error);
        showToast("保存失败，请检查浏览器存储权限", true);
        return false;
    }
}

function handleFormSubmit(event) {
    event.preventDefault();

    const sampleName = elements.sampleName.value.trim();
    const experimentDate = elements.experimentDate.value;
    const notes = elements.experimentNotes.value.trim();

    elements.sampleName.setCustomValidity(sampleName ? "" : "请输入样本名称");
    elements.experimentDate.setCustomValidity(experimentDate ? "" : "请选择实验日期");
    elements.experimentNotes.setCustomValidity(notes ? "" : "请输入实验备注");

    if (!elements.form.checkValidity()) {
        elements.form.reportValidity();
        return;
    }

    const newRecord = {
        id: createRecordId(),
        sampleName,
        experimentDate,
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
    updateNoteCount();
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
    renderRecords();
    updateStatistics();
    elements.clearRecordsButton.disabled = records.length === 0;
}

function renderRecords() {
    elements.recordsList.replaceChildren();
    elements.emptyState.hidden = records.length > 0;
    elements.recordCountLabel.textContent = `${records.length} 条记录`;

    if (records.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();

    records.forEach((record, index) => {
        fragment.appendChild(createRecordCard(record, index));
    });

    elements.recordsList.appendChild(fragment);
}

function createRecordCard(record, index) {
    const card = document.createElement("article");
    card.className = "record-card";

    const indexElement = document.createElement("span");
    indexElement.className = "record-index";
    indexElement.textContent = String(index + 1).padStart(2, "0");

    const body = document.createElement("div");
    body.className = "record-body";

    const heading = document.createElement("div");
    heading.className = "record-heading";

    const title = document.createElement("h3");
    title.textContent = record.sampleName;

    const date = document.createElement("time");
    date.className = "record-date";
    date.dateTime = record.experimentDate;
    date.textContent = formatExperimentDate(record.experimentDate);

    const note = document.createElement("p");
    note.className = "record-note";
    note.textContent = record.notes;

    const createdTime = document.createElement("p");
    createdTime.className = "record-created";
    createdTime.textContent = `创建于 ${formatCreatedTime(record.createdAt)}`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.dataset.recordId = record.id;
    deleteButton.setAttribute("aria-label", `删除记录：${record.sampleName}`);
    deleteButton.appendChild(createDeleteIcon());

    heading.append(title, date);
    body.append(heading, note, createdTime);
    card.append(indexElement, body, deleteButton);

    return card;
}

function createDeleteIcon() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");

    const paths = [
        "M4 7h16",
        "M9 7V4h6v3",
        "M7 7l1 13h8l1-13",
        "M10 11v5M14 11v5"
    ];

    paths.forEach((pathData) => {
        const path = document.createElementNS(svgNamespace, "path");
        path.setAttribute("d", pathData);
        svg.appendChild(path);
    });

    return svg;
}

function handleRecordListClick(event) {
    const deleteButton = event.target.closest(".delete-button");
    if (!deleteButton) {
        return;
    }

    const recordId = deleteButton.dataset.recordId;
    const record = records.find((item) => item.id === recordId);
    if (!record) {
        return;
    }

    const shouldDelete = window.confirm(`确定删除“${record.sampleName}”这条实验记录吗？`);
    if (!shouldDelete) {
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

function clearAllRecords() {
    if (records.length === 0) {
        return;
    }

    const shouldClear = window.confirm("确定清空全部实验记录吗？此操作无法撤销。");
    if (!shouldClear) {
        return;
    }

    const previousRecords = records;
    records = [];

    if (!saveRecords()) {
        records = previousRecords;
        return;
    }

    renderApp();
    showToast("全部实验记录已清空");
}

function updateStatistics() {
    elements.totalRecords.textContent = String(records.length);
    elements.weeklyRecords.textContent = String(countRecordsCreatedThisWeek());
    elements.latestExperimentDate.textContent = getLatestExperimentDate();
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

function formatExperimentDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
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
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 10);

    elements.experimentDate.value = localDate;
}

function updateNoteCount() {
    elements.noteCount.textContent = String(elements.experimentNotes.value.length);
}

function clearCustomValidity(event) {
    event.currentTarget.setCustomValidity("");
}

function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("show");

    toastTimer = window.setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 2600);
}

function handleNavigationClick(event) {
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });
    event.currentTarget.classList.add("active");
}
