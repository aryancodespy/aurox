/*
  Admin page.
  This page lets you:
  1. View and edit inventory manually
  2. View low-stock warnings
  3. Edit shipping settings
  4. View all saved orders
  5. Update order statuses

  Order tracking rule:
  - Pending Delivery Charge and Payment Submitted do not reduce stock
  - Stock is reduced only when an order becomes Confirmed
  - If a confirmed order is later Cancelled, stock is added back
*/

(function () {
  var products = window.AUROX_PRODUCTS || [];
  var inventoryTemplate = window.AUROX_INVENTORY || {};
  var shippingTemplate = window.AUROX_SHIPPING || {
    Sylhet: 70,
    "Outside Sylhet": 120
  };
  var inventoryKey = "aurox-inventory";
  var ordersKey = "aurox-orders";
  var shippingKey = "aurox-shipping-settings";
  var successTimeout;
  var statusOptions = [
    "Pending Delivery Charge",
    "Payment Submitted",
    "Confirmed",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled"
  ];

  function cloneInventoryTemplate() {
    return JSON.parse(JSON.stringify(inventoryTemplate));
  }

  function cloneShippingTemplate() {
    return JSON.parse(JSON.stringify(shippingTemplate));
  }

  function formatPrice(value) {
    return Math.round(Number(value) || 0) + " BDT";
  }

  function getInventory() {
    try {
      var rawInventory = localStorage.getItem(inventoryKey);
      var storedInventory = rawInventory ? JSON.parse(rawInventory) : null;
      var inventory = cloneInventoryTemplate();

      if (!storedInventory) {
        return inventory;
      }

      Object.keys(inventory).forEach(function (productId) {
        Object.keys(inventory[productId]).forEach(function (size) {
          if (
            storedInventory[productId] &&
            typeof storedInventory[productId][size] === "number"
          ) {
            inventory[productId][size] = storedInventory[productId][size];
          }
        });
      });

      return inventory;
    } catch (error) {
      return cloneInventoryTemplate();
    }
  }

  function saveInventory(inventory) {
    localStorage.setItem(inventoryKey, JSON.stringify(inventory));
  }

  function getShippingSettings() {
    try {
      var rawSettings = localStorage.getItem(shippingKey);
      var storedSettings = rawSettings ? JSON.parse(rawSettings) : null;
      var settings = cloneShippingTemplate();

      if (!storedSettings) {
        return settings;
      }

      Object.keys(settings).forEach(function (location) {
        if (typeof storedSettings[location] === "number") {
          settings[location] = storedSettings[location];
        }
      });

      return settings;
    } catch (error) {
      return cloneShippingTemplate();
    }
  }

  function saveShippingSettings(settings) {
    localStorage.setItem(shippingKey, JSON.stringify(settings));
  }

  function getOrders() {
    try {
      var rawOrders = localStorage.getItem(ordersKey);
      return rawOrders ? JSON.parse(rawOrders) : [];
    } catch (error) {
      return [];
    }
  }

  function saveOrders(orders) {
    localStorage.setItem(ordersKey, JSON.stringify(orders));
  }

  function showSuccess(selector, message) {
    var successBox = document.querySelector(selector);

    if (!successBox) {
      return;
    }

    successBox.textContent = message;
    successBox.classList.add("is-visible");

    clearTimeout(successTimeout);
    successTimeout = setTimeout(function () {
      successBox.classList.remove("is-visible");
    }, 2200);
  }

  function getStockNotice(value) {
    if (value <= 0) {
      return {
        text: "Warning: Out of Stock",
        className: "is-out"
      };
    }

    if (value <= 2) {
      return {
        text: "Warning: Only " + value + " left",
        className: "is-low"
      };
    }

    return {
      text: "In stock",
      className: ""
    };
  }

  function createStockCell(productId, size, value) {
    var notice = getStockNotice(value);

    return (
      '<div class="admin-stock-cell">' +
        '<input class="admin-stock-input ' + notice.className + '" type="number" min="0" value="' + value + '" data-stock-input="' + productId + '" data-size="' + size + '">' +
        '<p class="admin-stock-note ' + notice.className + '">' + notice.text + "</p>" +
      "</div>"
    );
  }

  function renderTable(inventory) {
    var tbody = document.querySelector("[data-admin-inventory-table]");

    tbody.innerHTML = products
      .map(function (product) {
        return (
          "<tr>" +
            "<td><strong>" + product.name + "</strong></td>" +
            "<td>" + createStockCell(product.id, "M", inventory[product.id].M) + "</td>" +
            "<td>" + createStockCell(product.id, "L", inventory[product.id].L) + "</td>" +
            "<td>" + createStockCell(product.id, "XL", inventory[product.id].XL) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function readTableValues() {
    var inventory = cloneInventoryTemplate();

    document.querySelectorAll("[data-stock-input]").forEach(function (input) {
      var productId = input.getAttribute("data-stock-input");
      var size = input.getAttribute("data-size");
      var value = Math.max(0, Number(input.value) || 0);
      inventory[productId][size] = value;
    });

    return inventory;
  }

  function renderShippingSettings() {
    var settings = getShippingSettings();
    var sylhetInput = document.querySelector('[data-shipping-input="Sylhet"]');
    var outsideInput = document.querySelector('[data-shipping-input="Outside Sylhet"]');

    if (sylhetInput) {
      sylhetInput.value = settings.Sylhet;
    }

    if (outsideInput) {
      outsideInput.value = settings["Outside Sylhet"];
    }
  }

  function readShippingSettings() {
    return {
      Sylhet: Math.max(
        0,
        Number(document.querySelector('[data-shipping-input="Sylhet"]').value) || 0,
      ),
      "Outside Sylhet": Math.max(
        0,
        Number(document.querySelector('[data-shipping-input="Outside Sylhet"]').value) || 0,
      )
    };
  }

  function getOrderItems(order) {
    return order.items || order.products || [];
  }

  function canApplyStock(inventory, order) {
    return getOrderItems(order).every(function (item) {
      return (
        inventory[item.productId] &&
        typeof inventory[item.productId][item.size] === "number" &&
        inventory[item.productId][item.size] >= item.quantity
      );
    });
  }

  function applyOrderStock(inventory, order, direction) {
    getOrderItems(order).forEach(function (item) {
      if (
        inventory[item.productId] &&
        typeof inventory[item.productId][item.size] === "number"
      ) {
        inventory[item.productId][item.size] = Math.max(
          0,
          inventory[item.productId][item.size] + direction * item.quantity,
        );
      }
    });
  }

  function formatOrderDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function renderOrders() {
    var container = document.querySelector("[data-admin-orders]");
    var orders = getOrders();

    if (!orders.length) {
      container.innerHTML =
        '<div class="admin-order-empty"><strong>No orders yet.</strong><p>Orders placed from checkout will appear here.</p></div>';
      return;
    }

    container.innerHTML = orders
      .map(function (order) {
        var paymentDetails =
          order.payment && (order.payment.transactionId || order.payment.deliveryChargeMethod)
            ? (
                '<div class="admin-order-summary">' +
                  "<p><strong>Upfront Method:</strong> " + (order.payment.deliveryChargeMethod || "-") + "</p>" +
                  "<p><strong>Transaction ID:</strong> " + (order.payment.transactionId || "-") + "</p>" +
                "</div>"
              )
            : "";

        return (
          '<article class="admin-order-card">' +
            '<div class="admin-order-head">' +
              "<div>" +
                "<strong>" + order.id + "</strong>" +
                "<p>" + formatOrderDate(order.createdAt) + "</p>" +
              "</div>" +
              '<select class="admin-order-status" data-order-status="' + order.id + '">' +
                statusOptions
                  .map(function (status) {
                    return '<option value="' + status + '"' + (order.status === status ? " selected" : "") + ">" + status + "</option>";
                  })
                  .join("") +
              "</select>" +
            "</div>" +
            '<div class="admin-order-meta">' +
              "<p><strong>Name:</strong> " + (order.customerName || order.customer && order.customer.name || "-") + "</p>" +
              "<p><strong>Phone:</strong> " + (order.phone || order.customer && order.customer.phone || "-") + "</p>" +
            "</div>" +
            '<div class="admin-order-meta">' +
              "<p><strong>Address:</strong> " + (order.address || order.shipping && order.shipping.address || "-") + "</p>" +
              "<p><strong>Delivery Division:</strong> " + (order.deliveryDivision || order.shipping && order.shipping.division || "-") + "</p>" +
            "</div>" +
            '<div class="admin-order-meta">' +
              "<p><strong>Delivery Location:</strong> " + (order.deliveryLocation || order.deliveryArea || order.shipping && order.shipping.location || "-") + "</p>" +
              "<p><strong>Status:</strong> " + order.status + "</p>" +
            "</div>" +
            '<div class="admin-order-summary">' +
              "<p><strong>Product Total:</strong> " + formatPrice(order.productTotal || order.amounts && order.amounts.productTotal || 0) + "</p>" +
              "<p><strong>Delivery Charge:</strong> " + formatPrice(order.deliveryCharge || order.amounts && order.amounts.deliveryCharge || 0) + "</p>" +
              "<p><strong>Pay Now:</strong> " + formatPrice(order.amountToPayNow || order.amounts && order.amounts.payNow || 0) + "</p>" +
              "<p><strong>Pay on Delivery:</strong> " + formatPrice(order.amountToPayOnDelivery || order.amounts && order.amounts.payOnDelivery || 0) + "</p>" +
              "<p><strong>Payment:</strong> " + (order.paymentMethod || order.payment && order.payment.method || "-") + "</p>" +
            "</div>" +
            paymentDetails +
            '<div class="admin-order-lines">' +
              getOrderItems(order)
                .map(function (item) {
                  return '<div class="admin-order-line">' + item.name + " / Size " + item.size + " / Qty " + item.quantity + "</div>";
                })
                .join("") +
            "</div>" +
          "</article>"
        );
      })
      .join("");

    bindOrderStatusHandlers();
  }

  function bindOrderStatusHandlers() {
    document.querySelectorAll("[data-order-status]").forEach(function (select) {
      select.addEventListener("change", function () {
        var orderId = select.getAttribute("data-order-status");
        var nextStatus = select.value;
        var orders = getOrders();
        var inventory = getInventory();
        var order = orders.find(function (item) {
          return item.id === orderId;
        });

        if (!order) {
          return;
        }

        if (nextStatus === "Confirmed" && !order.stockApplied) {
          if (!canApplyStock(inventory, order)) {
            select.value = order.status;
            showSuccess(
              "[data-admin-order-success]",
              "Not enough stock to confirm this order.",
            );
            return;
          }

          applyOrderStock(inventory, order, -1);
          order.stockApplied = true;
        }

        if (
          order.stockApplied &&
          (
            nextStatus === "Cancelled" ||
            nextStatus === "Pending Delivery Charge" ||
            nextStatus === "Payment Submitted"
          )
        ) {
          applyOrderStock(inventory, order, 1);
          order.stockApplied = false;
        }

        order.status = nextStatus;
        saveInventory(inventory);
        saveOrders(orders);
        renderTable(inventory);
        renderOrders();
        showSuccess("[data-admin-order-success]", "Order updated successfully.");
      });
    });
  }

  function initAdminPage() {
    renderTable(getInventory());
    renderShippingSettings();
    renderOrders();

    document
      .querySelector("[data-save-inventory]")
      .addEventListener("click", function () {
        saveInventory(readTableValues());
        renderTable(getInventory());
        renderOrders();
        showSuccess("[data-admin-success]", "Inventory saved successfully.");
      });

    document
      .querySelector("[data-reset-inventory]")
      .addEventListener("click", function () {
        var defaultInventory = cloneInventoryTemplate();
        saveInventory(defaultInventory);
        renderTable(defaultInventory);
        renderOrders();
        showSuccess("[data-admin-success]", "Inventory reset to default stock.");
      });

    document
      .querySelector("[data-save-shipping]")
      .addEventListener("click", function () {
        saveShippingSettings(readShippingSettings());
        renderShippingSettings();
        showSuccess("[data-admin-shipping-success]", "Shipping settings saved successfully.");
      });

    document
      .querySelector("[data-reset-shipping]")
      .addEventListener("click", function () {
        var defaultShipping = cloneShippingTemplate();
        saveShippingSettings(defaultShipping);
        renderShippingSettings();
        showSuccess("[data-admin-shipping-success]", "Shipping charges reset to default values.");
      });
  }

  initAdminPage();
})();
