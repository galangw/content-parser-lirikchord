let requestsTable;
let activePolling = new Set();

$(document).ready(function () {
  initializeDataTable();
  setupDragAndDrop();
  setupFormHandler();
  setupEngineSelection();
  loadRequests();
  setInterval(loadRequests, 5000);
});

function initializeDataTable() {
  requestsTable = $("#requestsTable").DataTable({
    order: [[4, "desc"]], // Sort by Created column
    columns: [
      { data: "id" },
      {
        data: "engineType",
        render: function (data) {
          const engineTypes = {
            lyrics: '<span class="badge bg-primary">Lyrics</span>',
            chord: '<span class="badge bg-success">Chord</span>',
            translation: '<span class="badge bg-info">Translation</span>',
          };
          return engineTypes[data] || data;
        },
      },
      {
        data: "status",
        render: function (data) {
          const statusClasses = {
            pending: "bg-warning",
            processing: "bg-info",
            completed: "bg-success",
            error: "bg-danger",
          };
          return `<span class="badge ${
            statusClasses[data] || "bg-secondary"
          }">${data}</span>`;
        },
      },
      {
        data: null,
        render: function (data) {
          const percent =
            Math.round((data.processedFiles / data.totalFiles) * 100) || 0;
          return `
                        <div class="progress" style="height: 15px;">
                            <div class="progress-bar" role="progressbar" 
                                style="width: ${percent}%" 
                                aria-valuenow="${percent}" 
                                aria-valuemin="0" 
                                aria-valuemax="100">
                                ${percent}%
                            </div>
                        </div>
                        <small class="text-muted">${data.processedFiles}/${data.totalFiles} files</small>
                    `;
        },
      },
      {
        data: "createdAt",
        render: function (data) {
          return new Date(data).toLocaleString();
        },
      },
      {
        data: null,
        render: function (data) {
          return `
                        <button class="btn btn-sm btn-info view-btn">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-btn">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
        },
      },
    ],
  });
}

function validateForm() {
  const engineType = $("#engineType").val();
  const files = $("input[type='file']")[0].files;

  if (!engineType) {
    showToast("Please select a processing engine", "error");
    return false;
  }

  if (files.length === 0) {
    showToast("Please select files to upload", "error");
    return false;
  }

  return true;
}

function setupEngineSelection() {
  $("#engineType").on("change", function () {
    $("#submitBtn").prop("disabled", !this.value);
  });
}

function setupDragAndDrop() {
  const dropArea = document.getElementById("dropArea");

  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    dropArea.addEventListener(eventName, () => {
      dropArea.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropArea.addEventListener(eventName, () => {
      dropArea.classList.remove("dragover");
    });
  });

  dropArea.addEventListener("drop", handleDrop);
}

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  document.querySelector('input[type="file"]').files = files;
}

function setupFormHandler() {
  $("#uploadForm").on("submit", async function (e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const formData = new FormData();
    const engineType = $("#engineType").val();
    const files = $("input[type='file']")[0].files;

    formData.append("engineType", engineType);
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        startPolling(data.requestId);
        this.reset();
        $("#submitBtn").prop("disabled", true);
        showToast("Upload started", "success");
      } else {
        showToast(data.error || "Upload failed", "error");
      }
    } catch (error) {
      console.error("Upload error:", error);
      showToast("Upload failed: " + error.message, "error");
    }
  });
}

async function loadRequests() {
  try {
    const response = await fetch("/requests");
    const requests = await response.json();
    requestsTable.clear().rows.add(requests).draw();

    requests.forEach((request) => {
      if (request.status === "processing") {
        startPolling(request.id);
      }
    });
  } catch (error) {
    console.error("Error loading requests:", error);
  }
}

function startPolling(requestId) {
  if (activePolling.has(requestId)) return;
  activePolling.add(requestId);
  pollProgress(requestId);
}

async function pollProgress(requestId) {
  try {
    const response = await fetch(`/progress/${requestId}`);
    if (!response.ok) {
      activePolling.delete(requestId);
      return;
    }

    const data = await response.json();
    updateTableRow(data);

    if (data.status === "completed" || data.status === "error") {
      activePolling.delete(requestId);
      if (data.status === "completed") {
        showToast(`Processing completed for request ${requestId}`, "success");
      }
    } else {
      setTimeout(() => pollProgress(requestId), 1000);
    }
  } catch (error) {
    console.error("Error polling progress:", error);
    activePolling.delete(requestId);
  }
}

function updateTableRow(data) {
  if (!data || !data.id) return;

  const rowData = {
    id: data.id,
    engineType: data.engineType || "unknown",
    status: data.status,
    processedFiles: data.processed,
    totalFiles: data.total,
    createdAt: data.createdAt || new Date().toISOString(),
  };

  const existingRow = requestsTable.row(`#request-${data.id}`);
  if (existingRow.length) {
    existingRow.data(rowData).draw(false);
  } else {
    requestsTable.row.add(rowData).draw(false);
  }
}

function showRequestDetails(requestId) {
  const modal = new bootstrap.Modal(document.getElementById("requestModal"));

  fetch(`/progress/${requestId}`)
    .then((response) => response.json())
    .then((data) => {
      $(".modal-title").text(`Request: ${requestId}`);
      $(".progress-bar")
        .css("width", `${data.percentage}%`)
        .text(`${data.percentage}%`);

      $("#modalStatus").html(`
                <div class="alert alert-info">
                    <p><strong>Status:</strong> ${data.status}</p>
                    <p><strong>Progress:</strong> ${data.processed}/${
        data.total
      } files</p>
                    <p><strong>Current file:</strong> ${
                      data.currentFile || "None"
                    }</p>
                </div>
            `);

      $("#engineType").text(data.engineType);

      if (data.errors.length > 0) {
        $("#modalErrors").html(`
                    <div class="alert alert-danger">
                        <h6>Errors:</h6>
                        <ul class="list-unstyled mb-0">
                            ${data.errors
                              .map(
                                (err) => `
                                    <li class="error-message">
                                        <strong>${err.file}:</strong> ${err.error}
                                    </li>
                                `
                              )
                              .join("")}
                        </ul>
                    </div>
                `);
      } else {
        $("#modalErrors").empty();
      }

      $("#modalDownload")
        .off("click")
        .on("click", () => {
          window.location.href = `/download/${requestId}`;
        });

      $("#modalDelete")
        .off("click")
        .on("click", async () => {
          if (confirm("Are you sure you want to delete this request?")) {
            await deleteRequest(requestId);
            modal.hide();
          }
        });

      modal.show();
    })
    .catch((error) => {
      showToast("Error loading request details: " + error.message, "error");
    });
}

async function deleteRequest(requestId) {
  try {
    const response = await fetch(`/request/${requestId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      requestsTable.row(`#request-${requestId}`).remove().draw(false);
      showToast("Request deleted successfully", "success");
    } else {
      throw new Error("Failed to delete request");
    }
  } catch (error) {
    showToast("Error deleting request: " + error.message, "error");
  }
}

function showToast(message, type = "info") {
  const toast = $(`
        <div class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <strong class="me-auto">${
                  type.charAt(0).toUpperCase() + type.slice(1)
                }</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `);

  if ($(".toast-container").length === 0) {
    $("body").append(
      '<div class="toast-container position-fixed bottom-0 end-0 p-3"></div>'
    );
  }

  $(".toast-container").append(toast);
  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();

  toast.on("hidden.bs.toast", function () {
    $(this).remove();
  });
}

// Event Handlers
$("#requestsTable").on("click", ".view-btn", function (e) {
  e.stopPropagation();
  const data = requestsTable.row($(this).closest("tr")).data();
  showRequestDetails(data.id);
});

$("#requestsTable").on("click", ".delete-btn", async function (e) {
  e.stopPropagation();
  const data = requestsTable.row($(this).closest("tr")).data();
  if (confirm("Are you sure you want to delete this request?")) {
    await deleteRequest(data.id);
  }
});
