/*
  Main site script for Aurox.
  It handles:
  1. Mobile navigation
  2. Product rendering, quick view, and size guide
  3. Cart storage with localStorage
  4. Inventory-aware stock display
  5. Checkout, order tracking, and delivery-charge payment submission
  6. Netlify-ready order notifications
*/

(function () {
  var products = window.AUROX_PRODUCTS || [];
  var inventoryTemplate = window.AUROX_INVENTORY || {};
  var shippingTemplate = window.AUROX_SHIPPING || {
    Sylhet: 70,
    "Outside Sylhet": 120
  };
  var cartKey = "aurox-cart";
  var inventoryKey = "aurox-inventory";
  var ordersKey = "aurox-orders";
  var shippingKey = "aurox-shipping-settings";
  var lastOrderKey = "aurox-last-order-id";
  var shippingCost = 0;
  var toastTimeout;
  var activeProductModal = null;
  var shopUpdateGrid = null;
  var sizeGuideRows = [
    { size: "M", length: '27"', chest: '38"' },
    { size: "L", length: '28"', chest: '40"' },
    { size: "XL", length: '29"', chest: '42"' }
  ];

  function formatPrice(value) {
    return Math.round(Number(value) || 0) + " BDT";
  }

  function formatOrderDate(value) {
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value || "-";
    }
  }

  function cloneInventoryTemplate() {
    return JSON.parse(JSON.stringify(inventoryTemplate));
  }

  function cloneShippingTemplate() {
    return JSON.parse(JSON.stringify(shippingTemplate));
  }

  function getProductById(id) {
    return products.find(function (product) {
      return product.id === id;
    });
  }

  function getCart() {
    try {
      var rawCart = localStorage.getItem(cartKey);
      return rawCart ? JSON.parse(rawCart) : [];
    } catch (error) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(cartKey, JSON.stringify(cart));
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

  function setLastOrderId(orderId) {
    localStorage.setItem(lastOrderKey, orderId);
  }

  function getLastOrderId() {
    return localStorage.getItem(lastOrderKey) || "";
  }

  function ensureInventoryState() {
    saveInventory(getInventory());
  }

  function ensureShippingState() {
    saveShippingSettings(getShippingSettings());
  }

  function getOrderItems(order) {
    return order.items || order.products || [];
  }

  function findOrderById(orderId) {
    return getOrders().find(function (order) {
      return order.id === orderId;
    }) || null;
  }

  function updateOrderById(orderId, updater) {
    var orders = getOrders();
    var targetOrder = null;

    orders.forEach(function (order) {
      if (order.id === orderId) {
        updater(order);
        targetOrder = order;
      }
    });

    if (!targetOrder) {
      return null;
    }

    saveOrders(orders);
    return targetOrder;
  }

  function getInventoryTotal(productId, size) {
    var inventory = getInventory();

    if (
      !inventory[productId] ||
      typeof inventory[productId][size] !== "number"
    ) {
      return 0;
    }

    return inventory[productId][size];
  }

  function getReservedCartQuantity(productId, size) {
    return getCart().reduce(function (total, item) {
      if (item.productId === productId && item.size === size) {
        return total + item.quantity;
      }

      return total;
    }, 0);
  }

  function getSizeStock(productId, size) {
    return Math.max(
      0,
      getInventoryTotal(productId, size) - getReservedCartQuantity(productId, size),
    );
  }

  function getTotalStock(productId) {
    var product = getProductById(productId);

    if (!product) {
      return 0;
    }

    return product.sizes.reduce(function (total, size) {
      return total + getSizeStock(productId, size);
    }, 0);
  }

  function getFirstAvailableSize(product) {
    var availableSize = product.sizes.find(function (size) {
      return getSizeStock(product.id, size) > 0;
    });

    return availableSize || product.sizes[0];
  }

  function getStockMessage(productId, size) {
    if (typeof size === "string") {
      var sizeStock = getSizeStock(productId, size);

      if (sizeStock <= 0) {
        return "Out of stock";
      }

      return "Only " + sizeStock + " left";
    }

    var totalStock = getTotalStock(productId);

    if (totalStock <= 0) {
      return "Out of stock";
    }

    return "Only " + totalStock + " left";
  }

  function getDeliveryCharge(location) {
    var settings = getShippingSettings();
    return Number(settings[location] || 0);
  }

  function getSelectedDeliveryLocation() {
    var selectedInput = document.querySelector("[data-delivery-area]:checked");
    return selectedInput ? selectedInput.value : "Sylhet";
  }

  function getDeliveryMismatchMessage(division, location) {
    if (!division || !location) {
      return "";
    }

    if (division === "Sylhet" && location === "Outside Sylhet") {
      return "Your selected division is Sylhet, but delivery location is Outside Sylhet. Please confirm your delivery location.";
    }

    if (division !== "Sylhet" && location === "Sylhet") {
      return "Your selected division is outside Sylhet, but delivery location is Sylhet. Please confirm your delivery location.";
    }

    return "";
  }

  function generateOrderId() {
    return "AUR-" + Date.now();
  }

  function getSizeGuideTableMarkup() {
    return (
      '<table class="size-guide-table">' +
        "<thead>" +
          "<tr><th>Size</th><th>Length</th><th>Chest</th></tr>" +
        "</thead>" +
        "<tbody>" +
          sizeGuideRows.map(function (row) {
            return (
              "<tr>" +
                "<td>" + row.size + "</td>" +
                "<td>" + row.length + "</td>" +
                "<td>" + row.chest + "</td>" +
              "</tr>"
            );
          }).join("") +
        "</tbody>" +
      "</table>"
    );
  }

  function encodeForm(data) {
    return Object.keys(data)
      .map(function (key) {
        return (
          encodeURIComponent(key) + "=" + encodeURIComponent(String(data[key]))
        );
      })
      .join("&");
  }

  function buildNetlifyOrderFields(order) {
    var items = getOrderItems(order);

    return {
      "form-name": "aurox-orders",
      order_id: order.id,
      customer_name: order.customerName,
      phone: order.phone,
      address: order.address,
      division: order.deliveryDivision,
      delivery_location: order.deliveryLocation,
      products: items
        .map(function (item) {
          return item.name + " / Size " + item.size + " / Qty " + item.quantity;
        })
        .join("\n"),
      sizes: items.map(function (item) { return item.size; }).join(", "),
      quantities: items.map(function (item) { return item.quantity; }).join(", "),
      product_total: order.productTotal,
      delivery_charge: order.deliveryCharge,
      status: order.status,
      order_json: JSON.stringify(order)
    };
  }

  function submitOrderToNetlify(order) {
    if (!window.fetch || !document.querySelector("[data-netlify-order-form]")) {
      return Promise.resolve(false);
    }

    return fetch("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: encodeForm(buildNetlifyOrderFields(order))
    })
      .then(function (response) {
        updateOrderById(order.id, function (targetOrder) {
          targetOrder.notificationStatus = response.ok ? "sent" : "failed";
          targetOrder.notificationSyncedAt = new Date().toISOString();
        });
        return response.ok;
      })
      .catch(function () {
        updateOrderById(order.id, function (targetOrder) {
          targetOrder.notificationStatus = "failed";
          targetOrder.notificationSyncedAt = new Date().toISOString();
        });
        return false;
      });
  }

  function clearCheckoutFieldErrors() {
    document.querySelectorAll("[data-field-error]").forEach(function (errorNode) {
      errorNode.textContent = "";
    });

    document
      .querySelectorAll(".checkout-form input, .checkout-form select, .checkout-form textarea")
      .forEach(function (field) {
        field.classList.remove("input-error");
      });
  }

  function setCheckoutFieldError(fieldId, message) {
    var field = document.getElementById(fieldId);
    var errorNode = document.querySelector('[data-field-error="' + fieldId + '"]');

    if (field) {
      field.classList.add("input-error");
    }

    if (errorNode) {
      errorNode.textContent = message;
    }
  }

  function setCheckoutDeliveryAreaError(message) {
    var errorNode = document.querySelector('[data-field-error="delivery-area"]');

    if (errorNode) {
      errorNode.textContent = message;
    }
  }

  function updateDeliveryConfirmationState() {
    var divisionField = document.getElementById("delivery-division");
    var warningNode = document.querySelector("[data-delivery-match-warning]");
    var confirmationWrap = document.querySelector("[data-delivery-confirmation-wrap]");
    var confirmationInput = document.querySelector("[data-delivery-confirmation]");
    var mismatchMessage = getDeliveryMismatchMessage(
      divisionField ? divisionField.value : "",
      getSelectedDeliveryLocation(),
    );

    if (!warningNode || !confirmationWrap || !confirmationInput) {
      return {
        mismatchMessage: mismatchMessage,
        confirmed: true
      };
    }

    if (mismatchMessage) {
      warningNode.hidden = false;
      warningNode.className = "inventory-warning";
      warningNode.textContent = mismatchMessage;
      confirmationWrap.hidden = false;
    } else {
      warningNode.hidden = true;
      warningNode.textContent = "";
      confirmationWrap.hidden = true;
      confirmationInput.checked = false;
    }

    return {
      mismatchMessage: mismatchMessage,
      confirmed: confirmationInput.checked
    };
  }

  function validateCheckoutFields() {
    var customerNameField = document.querySelector("#customer-name");
    var phoneField = document.querySelector("#checkout-phone");
    var emailField = document.querySelector("#checkout-email");
    var addressField = document.querySelector("#address");
    var divisionField = document.querySelector("#delivery-division");
    var deliveryLocation = getSelectedDeliveryLocation();
    var mismatchState = updateDeliveryConfirmationState();
    var hasError = false;

    if (!customerNameField || !phoneField || !addressField || !divisionField) {
      return null;
    }

    clearCheckoutFieldErrors();

    if (!customerNameField.value.trim()) {
      setCheckoutFieldError("customer-name", "Customer name is required.");
      hasError = true;
    }

    if (!phoneField.value.trim()) {
      setCheckoutFieldError("checkout-phone", "Phone number is required.");
      hasError = true;
    }

    if (!addressField.value.trim()) {
      setCheckoutFieldError("address", "Full delivery address is required.");
      hasError = true;
    }

    if (!divisionField.value) {
      setCheckoutFieldError("delivery-division", "Delivery division is required.");
      hasError = true;
    }

    if (!deliveryLocation) {
      setCheckoutDeliveryAreaError("Delivery location is required.");
      hasError = true;
    }

    if (mismatchState.mismatchMessage && !mismatchState.confirmed) {
      hasError = true;
    }

    if (hasError) {
      return null;
    }

    return {
      customerName: customerNameField.value.trim(),
      phone: phoneField.value.trim(),
      email: emailField ? emailField.value.trim() : "",
      address: addressField.value.trim(),
      deliveryDivision: divisionField.value,
      deliveryLocation: deliveryLocation
    };
  }

  function getCartIssues() {
    return getCartDetails().filter(function (item) {
      return item.quantity > getInventoryTotal(item.product.id, item.size);
    });
  }

  function getToast() {
    var existingToast = document.querySelector("[data-cart-toast]");

    if (existingToast) {
      return existingToast;
    }

    var toast = document.createElement("div");
    toast.className = "cart-toast";
    toast.setAttribute("data-cart-toast", "");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(message) {
    var toast = getToast();
    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2400);
  }

  function updateCartCount() {
    var count = getCart().reduce(function (total, item) {
      return total + item.quantity;
    }, 0);

    document.querySelectorAll("[data-cart-count]").forEach(function (badge) {
      badge.textContent = count;
    });
  }

  function refreshStoreViews() {
    renderFeaturedProducts();

    if (shopUpdateGrid) {
      shopUpdateGrid();
    }

    renderCartPage();
    renderCheckoutPage();
    renderTrackOrderPage();

    if (activeProductModal) {
      openProductModal(activeProductModal);
    }
  }

  function addToCart(productId, size, quantity) {
    var product = getProductById(productId);
    var itemSize = size || (product ? product.sizes[0] : "M");
    var itemQuantity = Math.max(1, Number(quantity) || 1);
    var availableStock = getSizeStock(productId, itemSize);

    if (availableStock <= 0) {
      showToast("Out of stock");
      return false;
    }

    if (itemQuantity > availableStock) {
      showToast(getStockMessage(productId, itemSize));
      return false;
    }

    var cart = getCart();
    var existingItem = cart.find(function (item) {
      return item.productId === productId && item.size === itemSize;
    });

    if (existingItem) {
      existingItem.quantity += itemQuantity;
    } else {
      cart.push({
        productId: productId,
        quantity: itemQuantity,
        size: itemSize
      });
    }

    saveCart(cart);
    updateCartCount();
    refreshStoreViews();
    showToast("Item added to cart");
    return true;
  }

  function removeFromCart(productId, size) {
    var updatedCart = getCart().filter(function (item) {
      return !(item.productId === productId && item.size === size);
    });

    saveCart(updatedCart);
    updateCartCount();
    refreshStoreViews();
  }

  function updateQuantity(productId, size, nextQuantity) {
    var cart = getCart();
    var currentItem = cart.find(function (item) {
      return item.productId === productId && item.size === size;
    });

    if (!currentItem) {
      return;
    }

    if (nextQuantity <= 0) {
      removeFromCart(productId, size);
      return;
    }

    var maxAllowed = getInventoryTotal(productId, size);

    if (nextQuantity > maxAllowed) {
      showToast(getStockMessage(productId, size));
      return;
    }

    currentItem.quantity = nextQuantity;
    saveCart(cart);
    updateCartCount();
    refreshStoreViews();
  }

  function getCartDetails() {
    return getCart()
      .map(function (item) {
        var product = getProductById(item.productId);

        if (!product) {
          return null;
        }

        return {
          product: product,
          quantity: item.quantity,
          size: item.size,
          lineTotal: product.price * item.quantity
        };
      })
      .filter(Boolean);
  }

  function getCartTotals() {
    var items = getCartDetails();
    var subtotal = items.reduce(function (total, item) {
      return total + item.lineTotal;
    }, 0);

    return {
      items: items,
      subtotal: subtotal,
      shipping: items.length ? shippingCost : 0,
      tax: 0
    };
  }

  function markActiveNav() {
    var currentPage = document.body.getAttribute("data-page");
    var pageMap = {
      home: "index.html",
      about: "about.html",
      shop: "shop.html",
      contact: "contact.html",
      cart: "cart.html",
      checkout: "checkout.html",
      "track-order": "track-order.html"
    };

    document.querySelectorAll(".site-nav a").forEach(function (link) {
      if (link.getAttribute("href") === pageMap[currentPage]) {
        link.classList.add("active");
      }
    });
  }

  function setupMobileMenu() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var nav = document.querySelector("[data-site-nav]");

    if (!toggle || !nav) {
      return;
    }

    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  function renderDeliveryOptionPricing() {
    var settings = getShippingSettings();
    var sylhetLabel = document.querySelector('[data-delivery-price-label="Sylhet"]');
    var outsideLabel = document.querySelector('[data-delivery-price-label="Outside Sylhet"]');

    if (sylhetLabel) {
      sylhetLabel.textContent = "Delivery charge / " + formatPrice(settings.Sylhet);
    }

    if (outsideLabel) {
      outsideLabel.textContent = "Delivery charge / " + formatPrice(settings["Outside Sylhet"]);
    }
  }

  function createProductCard(product) {
    var totalStock = getTotalStock(product.id);
    var stockMessage = getStockMessage(product.id);
    var stockClass = totalStock <= 0 ? " stock-note-out" : "";

    return (
      '<article class="product-card">' +
        '<div class="product-card-image">' +
          (
            totalStock <= 0
              ? '<span class="product-badge product-badge-out">Out of Stock</span>'
              : product.isNew
                ? '<span class="product-badge">New Drop</span>'
                : ""
          ) +
          '<button class="product-visual-button" type="button" data-view-product="' + product.id + '" aria-label="View details for ' + product.name + '">' +
            '<img src="' + product.image + '" alt="' + product.alt + '">' +
          "</button>" +
        "</div>" +
        '<div class="product-content">' +
          '<div class="product-meta">' +
            "<div>" +
              '<button class="product-name-button" type="button" data-view-product="' + product.id + '">' + product.name + "</button>" +
              "<p>" + product.color + " / " + product.material + "</p>" +
            "</div>" +
            "<strong>" + formatPrice(product.price) + "</strong>" +
          "</div>" +
          '<p class="stock-note' + stockClass + '">' + stockMessage + "</p>" +
          '<div class="product-link-row">' +
            '<button class="button button-light" type="button" data-view-product="' + product.id + '">View Product</button>' +
            '<button class="size-guide-link" type="button" data-size-guide>Size Guide</button>' +
          "</div>" +
          '<button class="button button-dark" type="button" data-add-to-cart="' + product.id + '"' + (totalStock <= 0 ? " disabled" : "") + ">Add to Cart</button>" +
        "</div>" +
      "</article>"
    );
  }

  function bindAddToCartButtons() {
    document.querySelectorAll("[data-add-to-cart]").forEach(function (button) {
      button.addEventListener("click", function () {
        var productId = button.getAttribute("data-add-to-cart");
        var product = getProductById(productId);
        var defaultSize = product ? getFirstAvailableSize(product) : "M";
        addToCart(productId, defaultSize, 1);
      });
    });
  }

  function bindViewProductButtons() {
    document.querySelectorAll("[data-view-product]").forEach(function (button) {
      button.addEventListener("click", function () {
        openProductModal(button.getAttribute("data-view-product"));
      });
    });
  }

  function getInfoModal() {
    var existingModal = document.querySelector("[data-info-modal]");

    if (existingModal) {
      return existingModal;
    }

    var modal = document.createElement("div");
    modal.className = "info-modal";
    modal.setAttribute("data-info-modal", "");
    modal.setAttribute("hidden", "");
    modal.innerHTML =
      '<div class="info-modal-backdrop" data-close-info-modal></div>' +
      '<div class="info-modal-dialog panel" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">' +
        '<button class="product-modal-close" type="button" aria-label="Close size guide" data-close-info-modal>X</button>' +
        '<p class="eyebrow">Size Guide</p>' +
        '<h2 id="info-modal-title">Find your ideal Aurox fit</h2>' +
        '<p>Use the Aurox t-shirt measurements below to choose the size that feels right for you.</p>' +
        getSizeGuideTableMarkup() +
      "</div>";

    document.body.appendChild(modal);
    return modal;
  }

  function openSizeGuideModal() {
    var modal = getInfoModal();
    modal.removeAttribute("hidden");
    document.body.classList.add("modal-open");

    modal.querySelectorAll("[data-close-info-modal]").forEach(function (button) {
      button.onclick = closeInfoModal;
    });
  }

  function closeInfoModal() {
    var modal = document.querySelector("[data-info-modal]");

    if (!modal) {
      return;
    }

    modal.setAttribute("hidden", "");
    document.body.classList.remove("modal-open");
  }

  function bindSizeGuideButtons() {
    document.querySelectorAll("[data-size-guide], [data-open-size-guide]").forEach(function (button) {
      button.addEventListener("click", function () {
        openSizeGuideModal();
      });
    });
  }

  function getProductModal() {
    var existingModal = document.querySelector("[data-product-modal]");

    if (existingModal) {
      return existingModal;
    }

    var modal = document.createElement("div");
    modal.className = "product-modal";
    modal.setAttribute("data-product-modal", "");
    modal.setAttribute("hidden", "");
    modal.innerHTML =
      '<div class="product-modal-backdrop" data-close-product-modal></div>' +
      '<div class="product-modal-dialog panel" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">' +
        '<button class="product-modal-close" type="button" aria-label="Close product details" data-close-product-modal>X</button>' +
        '<div class="product-modal-layout">' +
          '<div class="product-modal-media">' +
            '<img src="" alt="" data-modal-image>' +
          "</div>" +
          '<div class="product-modal-copy">' +
            '<p class="eyebrow">Aurox Product</p>' +
            '<h2 id="product-modal-title" data-modal-name></h2>' +
            '<p class="product-modal-price" data-modal-price></p>' +
            '<div class="product-modal-details">' +
              '<p><strong>Material:</strong> <span data-modal-material></span></p>' +
              '<p><strong>Category:</strong> <span data-modal-category></span></p>' +
              '<p><strong>Color:</strong> <span data-modal-color></span></p>' +
              '<p><strong>Available sizes:</strong> <span data-modal-sizes></span></p>' +
            "</div>" +
            '<p class="product-modal-description" data-modal-description></p>' +
            '<div class="size-guide-box">' +
              '<div class="size-guide-head">' +
                '<strong>Size Guide</strong>' +
                '<button class="size-guide-link" type="button" data-open-size-guide>Open full guide</button>' +
              "</div>" +
              getSizeGuideTableMarkup() +
            "</div>" +
            '<p class="modal-stock-text" data-modal-stock></p>' +
            '<div class="product-modal-actions">' +
              '<div class="product-option-group">' +
                '<label for="product-size-select">Size</label>' +
                '<select id="product-size-select" data-modal-size></select>' +
              "</div>" +
              '<div class="product-option-group">' +
                '<label for="product-quantity-select">Quantity</label>' +
                '<div class="modal-quantity-control">' +
                  '<button type="button" data-modal-quantity-decrease>-</button>' +
                  '<input id="product-quantity-select" type="number" min="1" value="1" data-modal-quantity>' +
                  '<button type="button" data-modal-quantity-increase>+</button>' +
                "</div>" +
              "</div>" +
            "</div>" +
            '<div class="product-modal-buttons">' +
              '<button class="button button-dark" type="button" data-modal-add-to-cart>Add to Cart</button>' +
              '<button class="button button-light" type="button" data-close-product-modal>Back to Shop</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";

    document.body.appendChild(modal);
    return modal;
  }

  function closeProductModal() {
    var modal = getProductModal();
    modal.setAttribute("hidden", "");
    document.body.classList.remove("modal-open");
    activeProductModal = null;
  }

  function updateModalStockState(productId) {
    var modal = getProductModal();
    var sizeSelect = modal.querySelector("[data-modal-size]");
    var quantityInput = modal.querySelector("[data-modal-quantity]");
    var stockText = modal.querySelector("[data-modal-stock]");
    var addButton = modal.querySelector("[data-modal-add-to-cart]");
    var selectedSize = sizeSelect.value;
    var selectedStock = getSizeStock(productId, selectedSize);
    var nextQuantity = Math.max(1, Number(quantityInput.value) || 1);

    stockText.textContent = getStockMessage(productId, selectedSize);
    stockText.className =
      "modal-stock-text" + (selectedStock <= 0 ? " modal-stock-out" : "");

    quantityInput.max = Math.max(1, selectedStock);
    quantityInput.value = Math.min(nextQuantity, Math.max(1, selectedStock || 1));
    addButton.disabled = selectedStock <= 0;
  }

  function openProductModal(productId) {
    var product = getProductById(productId);

    if (!product) {
      return;
    }

    var modal = getProductModal();
    modal.querySelector("[data-modal-image]").src = product.image;
    modal.querySelector("[data-modal-image]").alt = product.alt;
    modal.querySelector("[data-modal-name]").textContent = product.name;
    modal.querySelector("[data-modal-price]").textContent = formatPrice(product.price);
    modal.querySelector("[data-modal-material]").textContent = product.material;
    modal.querySelector("[data-modal-category]").textContent = product.type || "Unisex T-Shirt";
    modal.querySelector("[data-modal-color]").textContent = product.color;
    modal.querySelector("[data-modal-sizes]").textContent = product.sizes.join(", ");
    modal.querySelector("[data-modal-description]").textContent = product.description;

    var sizeSelect = modal.querySelector("[data-modal-size]");
    sizeSelect.innerHTML = product.sizes
      .map(function (size) {
        var sizeStock = getSizeStock(product.id, size);
        return (
          '<option value="' +
          size +
          '"' +
          (sizeStock <= 0 ? " disabled" : "") +
          ">" +
          size +
          (sizeStock <= 0 ? " - Out of stock" : "") +
          "</option>"
        );
      })
      .join("");

    sizeSelect.value = getFirstAvailableSize(product);

    var quantityInput = modal.querySelector("[data-modal-quantity]");
    quantityInput.value = 1;
    activeProductModal = productId;

    sizeSelect.onchange = function () {
      updateModalStockState(productId);
    };

    quantityInput.oninput = function () {
      updateModalStockState(productId);
    };

    modal.querySelector("[data-modal-add-to-cart]").onclick = function () {
      var wasAdded = addToCart(
        productId,
        sizeSelect.value,
        Number(quantityInput.value) || 1,
      );

      if (wasAdded) {
        closeProductModal();
      }
    };

    modal.querySelectorAll("[data-close-product-modal]").forEach(function (button) {
      button.onclick = closeProductModal;
    });

    modal.querySelector("[data-modal-quantity-decrease]").onclick = function () {
      quantityInput.value = Math.max(1, Number(quantityInput.value || 1) - 1);
      updateModalStockState(productId);
    };

    modal.querySelector("[data-modal-quantity-increase]").onclick = function () {
      quantityInput.value = Number(quantityInput.value || 1) + 1;
      updateModalStockState(productId);
    };

    bindSizeGuideButtons();
    updateModalStockState(productId);
    modal.removeAttribute("hidden");
    document.body.classList.add("modal-open");
  }

  function renderFeaturedProducts() {
    var container = document.querySelector("[data-featured-products]");

    if (!container) {
      return;
    }

    container.innerHTML = products.slice(0, 4).map(createProductCard).join("");
    bindAddToCartButtons();
    bindViewProductButtons();
    bindSizeGuideButtons();
  }

  function renderShopProducts() {
    var container = document.querySelector("[data-shop-products]");

    if (!container) {
      return;
    }

    var searchInput = document.querySelector("[data-search-input]");
    var categoryFilter = document.querySelector("[data-category-filter]");
    var sizeFilter = document.querySelector("[data-size-filter]");
    var priceFilter = document.querySelector("[data-price-filter]");
    var priceValue = document.querySelector("[data-price-value]");
    var sortFilter = document.querySelector("[data-sort-filter]");
    var countLabel = document.querySelector("[data-shop-count]");

    shopUpdateGrid = function () {
      var searchText = searchInput.value.trim().toLowerCase();
      var selectedCategory = categoryFilter.value;
      var selectedSize = sizeFilter.value;
      var maxPrice = Number(priceFilter.value);
      var sortValue = sortFilter.value;

      priceValue.textContent = maxPrice + " BDT";

      var filteredProducts = products.filter(function (product) {
        var matchesSearch = product.name.toLowerCase().indexOf(searchText) > -1;
        var matchesCategory =
          selectedCategory === "All" || product.category === selectedCategory;
        var matchesSize =
          selectedSize === "All" || product.sizes.indexOf(selectedSize) > -1;
        var matchesPrice = product.price <= maxPrice;

        return matchesSearch && matchesCategory && matchesSize && matchesPrice;
      });

      filteredProducts.sort(function (first, second) {
        if (sortValue === "price-low") {
          return first.price - second.price;
        }
        if (sortValue === "price-high") {
          return second.price - first.price;
        }
        if (sortValue === "popularity") {
          return second.popularity - first.popularity;
        }
        return Number(second.isNew) - Number(first.isNew);
      });

      countLabel.textContent = filteredProducts.length;
      container.innerHTML = filteredProducts.map(createProductCard).join("");

      if (!filteredProducts.length) {
        container.innerHTML =
          '<div class="panel empty-state"><h3>No products found</h3><p>Try adjusting your filters to explore more premium tees and upcoming Aurox drops.</p></div>';
      }

      bindAddToCartButtons();
      bindViewProductButtons();
      bindSizeGuideButtons();
    };

    if (!container.dataset.filtersBound) {
      [searchInput, categoryFilter, sizeFilter, priceFilter, sortFilter].forEach(function (field) {
        field.addEventListener("input", function () {
          shopUpdateGrid();
        });
        field.addEventListener("change", function () {
          shopUpdateGrid();
        });
      });

      container.dataset.filtersBound = "true";
    }

    shopUpdateGrid();
  }

  function renderCartPage() {
    var itemsContainer = document.querySelector("[data-cart-items]");

    if (!itemsContainer) {
      return;
    }

    var totals = getCartTotals();
    var subtotalNode = document.querySelector("[data-cart-subtotal]");
    var shippingNode = document.querySelector("[data-cart-shipping]");
    var totalNode = document.querySelector("[data-cart-total]");
    var warningNode = document.querySelector("[data-cart-warning]");
    var checkoutButton = document.querySelector("[data-cart-checkout]");
    var cartIssues = getCartIssues();

    if (!totals.items.length) {
      itemsContainer.innerHTML =
        '<article class="panel empty-state">' +
          "<h3>Your cart is empty.</h3>" +
          "<p>Start with premium unisex t-shirts from the first Aurox drop.</p>" +
          '<a class="button button-dark" href="shop.html">Continue Shopping</a>' +
        "</article>";
    } else {
      itemsContainer.innerHTML = totals.items.map(function (item) {
        var maxAllowed = getInventoryTotal(item.product.id, item.size);
        var lineWarning =
          item.quantity > maxAllowed
            ? '<p class="inventory-warning is-error">Available stock for size ' + item.size + " is now " + maxAllowed + ".</p>"
            : "";

        return (
          '<article class="panel cart-item">' +
            '<img class="cart-item-image" src="' + item.product.image + '" alt="' + item.product.alt + '">' +
            '<div class="cart-item-body">' +
              '<div class="cart-item-top">' +
                "<div>" +
                  "<h3>" + item.product.name + "</h3>" +
                  "<p>Size: " + item.size + " / Color: " + item.product.color + " / " + item.product.material + "</p>" +
                  lineWarning +
                "</div>" +
                "<strong>" + formatPrice(item.product.price) + "</strong>" +
              "</div>" +
              '<div class="cart-item-actions">' +
                '<div class="quantity-control">' +
                  '<button type="button" data-decrease="' + item.product.id + '" data-size="' + item.size + '">-</button>' +
                  "<strong>" + item.quantity + "</strong>" +
                  '<button type="button" data-increase="' + item.product.id + '" data-size="' + item.size + '"' + (item.quantity >= maxAllowed ? " disabled" : "") + ">+</button>" +
                "</div>" +
                '<button class="remove-button" type="button" data-remove="' + item.product.id + '" data-size="' + item.size + '">Remove</button>' +
              "</div>" +
            "</div>" +
          "</article>"
        );
      }).join("");
    }

    subtotalNode.textContent = formatPrice(totals.subtotal);
    shippingNode.textContent = formatPrice(totals.shipping);
    totalNode.textContent = formatPrice(totals.subtotal + totals.shipping);

    if (warningNode && checkoutButton) {
      if (cartIssues.length) {
        warningNode.hidden = false;
        warningNode.className = "inventory-warning is-error";
        warningNode.textContent = "Update your cart quantities before checkout. Some sizes now have lower stock.";
        checkoutButton.classList.add("button-disabled");
        checkoutButton.setAttribute("aria-disabled", "true");
        checkoutButton.removeAttribute("href");
      } else {
        warningNode.hidden = true;
        warningNode.textContent = "";
        warningNode.className = "inventory-warning";
        checkoutButton.classList.remove("button-disabled");
        checkoutButton.setAttribute("href", "checkout.html");
        checkoutButton.removeAttribute("aria-disabled");
      }
    }

    bindCartButtons();
  }

  function bindCartButtons() {
    document.querySelectorAll("[data-increase]").forEach(function (button) {
      button.addEventListener("click", function () {
        var productId = button.getAttribute("data-increase");
        var size = button.getAttribute("data-size");
        var cartItem = getCart().find(function (item) {
          return item.productId === productId && item.size === size;
        });

        if (cartItem) {
          updateQuantity(productId, size, cartItem.quantity + 1);
        }
      });
    });

    document.querySelectorAll("[data-decrease]").forEach(function (button) {
      button.addEventListener("click", function () {
        var productId = button.getAttribute("data-decrease");
        var size = button.getAttribute("data-size");
        var cartItem = getCart().find(function (item) {
          return item.productId === productId && item.size === size;
        });

        if (cartItem) {
          updateQuantity(productId, size, cartItem.quantity - 1);
        }
      });
    });

    document.querySelectorAll("[data-remove]").forEach(function (button) {
      button.addEventListener("click", function () {
        removeFromCart(
          button.getAttribute("data-remove"),
          button.getAttribute("data-size"),
        );
      });
    });
  }

  function renderCheckoutSuccessState() {
    var successNode = document.querySelector("[data-checkout-success]");

    if (!successNode) {
      return;
    }

    var order = findOrderById(getLastOrderId());
    var orderIdNode = successNode.querySelector("[data-last-order-id]");
    var paymentForm = successNode.querySelector("[data-payment-submit-form]");
    var paymentMessage = successNode.querySelector("[data-payment-submit-message]");
    var paymentMethodField = successNode.querySelector("[data-payment-method]");
    var transactionField = successNode.querySelector("[data-payment-transaction-id]");

    if (!order) {
      successNode.hidden = true;
      return;
    }

    successNode.hidden = false;

    if (orderIdNode) {
      orderIdNode.textContent = order.id;
    }

    if (paymentMethodField) {
      paymentMethodField.value = "";
    }

    if (transactionField) {
      transactionField.value = "";
    }

    if (paymentMessage) {
      paymentMessage.hidden = false;
      paymentMessage.className = "inventory-warning";

      if (order.status === "Payment Submitted") {
        paymentMessage.textContent =
          "Payment information submitted successfully. We will verify your delivery charge and update the order soon.";
      } else if (
        order.status === "Confirmed" ||
        order.status === "Processing" ||
        order.status === "Shipped" ||
        order.status === "Delivered"
      ) {
        paymentMessage.textContent =
          "Delivery charge received. Current order status: " + order.status + ".";
      } else if (order.status === "Cancelled") {
        paymentMessage.textContent =
          "This order has been cancelled. If you need help, please contact Aurox support.";
      } else {
        paymentMessage.textContent =
          "After payment, submit your transaction ID and payment method below.";
      }
    }

    if (paymentForm) {
      paymentForm.hidden = order.status !== "Pending Delivery Charge";
    }
  }

  function renderCheckoutPage() {
    var container = document.querySelector("[data-checkout-products]");

    if (!container) {
      return;
    }

    renderDeliveryOptionPricing();

    var selectedArea = getSelectedDeliveryLocation();
    var deliveryCharge = getDeliveryCharge(selectedArea);
    var totals = getCartTotals();
    var subtotalNode = document.querySelector("[data-checkout-subtotal]");
    var shippingNode = document.querySelector("[data-checkout-shipping]");
    var payNowNode = document.querySelector("[data-checkout-pay-now]");
    var payLaterNode = document.querySelector("[data-checkout-pay-later]");
    var warningNode = document.querySelector("[data-checkout-warning]");
    var placeOrderButton = document.querySelector("[data-place-order]");
    var cartIssues = getCartIssues();
    var mismatchState = updateDeliveryConfirmationState();
    var successNode = document.querySelector("[data-checkout-success]");

    if (!totals.items.length) {
      container.innerHTML =
        '<div class="payment-placeholder"><strong>No items in cart</strong><p>Add products from the shop before placing an order.</p></div>';
    } else {
      container.innerHTML = totals.items.map(function (item) {
        return (
          '<article class="checkout-product">' +
            '<img src="' + item.product.image + '" alt="' + item.product.alt + '">' +
            "<div>" +
              "<strong>" + item.product.name + "</strong>" +
              "<p>Qty " + item.quantity + " / Size " + item.size + "</p>" +
            "</div>" +
            "<strong>" + formatPrice(item.lineTotal) + "</strong>" +
          "</article>"
        );
      }).join("");
    }

    subtotalNode.textContent = formatPrice(totals.subtotal);
    shippingNode.textContent = formatPrice(totals.items.length ? deliveryCharge : 0);
    payNowNode.textContent = formatPrice(totals.items.length ? deliveryCharge : 0);
    payLaterNode.textContent = formatPrice(totals.subtotal);

    if (placeOrderButton) {
      placeOrderButton.hidden = !totals.items.length;
    }

    if (warningNode && placeOrderButton) {
      if (!totals.items.length) {
        warningNode.hidden = Boolean(findOrderById(getLastOrderId()));
        warningNode.className = "inventory-warning";
        warningNode.textContent = warningNode.hidden
          ? ""
          : "Add products to your cart before placing an order.";
        placeOrderButton.disabled = true;
      } else if (cartIssues.length) {
        warningNode.hidden = false;
        warningNode.className = "inventory-warning is-error";
        warningNode.textContent = "Some cart sizes are no longer available in that quantity. Please return to cart and update them.";
        placeOrderButton.disabled = true;
      } else if (mismatchState.mismatchMessage && !mismatchState.confirmed) {
        warningNode.hidden = false;
        warningNode.className = "inventory-warning";
        warningNode.textContent = "Please confirm your delivery location before placing the order.";
        placeOrderButton.disabled = true;
      } else {
        warningNode.hidden = true;
        warningNode.textContent = "";
        warningNode.className = "inventory-warning";
        placeOrderButton.disabled = false;
      }
    }

    if (successNode) {
      if (totals.items.length) {
        successNode.hidden = true;
      } else {
        renderCheckoutSuccessState();
      }
    }
  }

  function buildOrderPayload(checkoutData, cartItems) {
    var deliveryCharge = getDeliveryCharge(checkoutData.deliveryLocation);
    var items = cartItems.map(function (item) {
      return {
        productId: item.product.id,
        name: item.product.name,
        size: item.size,
        quantity: item.quantity,
        price: item.product.price,
        lineTotal: item.lineTotal
      };
    });
    var productTotal = items.reduce(function (total, item) {
      return total + item.lineTotal;
    }, 0);

    return {
      id: generateOrderId(),
      customerName: checkoutData.customerName,
      phone: checkoutData.phone,
      email: checkoutData.email,
      address: checkoutData.address,
      deliveryDivision: checkoutData.deliveryDivision,
      deliveryLocation: checkoutData.deliveryLocation,
      deliveryArea: checkoutData.deliveryLocation,
      customer: {
        name: checkoutData.customerName,
        phone: checkoutData.phone,
        email: checkoutData.email
      },
      shipping: {
        address: checkoutData.address,
        division: checkoutData.deliveryDivision,
        location: checkoutData.deliveryLocation,
        deliveryCharge: deliveryCharge
      },
      items: items,
      products: items,
      amounts: {
        productTotal: productTotal,
        deliveryCharge: deliveryCharge,
        payNow: deliveryCharge,
        payOnDelivery: productTotal
      },
      productTotal: productTotal,
      deliveryCharge: deliveryCharge,
      amountToPayNow: deliveryCharge,
      amountToPayOnDelivery: productTotal,
      paymentMethod: "Cash on Delivery",
      payment: {
        method: "Cash on Delivery",
        deliveryChargeMethod: "",
        transactionId: "",
        submittedAt: ""
      },
      status: "Pending Delivery Charge",
      stockApplied: false,
      source: "website",
      notificationStatus: "pending",
      createdAt: new Date().toISOString()
    };
  }

  function initCheckoutPage() {
    var placeOrderButton = document.querySelector("[data-place-order]");
    var paymentForm = document.querySelector("[data-payment-submit-form]");

    if (!placeOrderButton) {
      return;
    }

    renderDeliveryOptionPricing();

    document.querySelectorAll("[data-delivery-area]").forEach(function (input) {
      input.addEventListener("change", function () {
        clearCheckoutFieldErrors();
        updateDeliveryConfirmationState();
        renderCheckoutPage();
      });
    });

    var deliveryDivisionField = document.querySelector("#delivery-division");
    var deliveryConfirmationField = document.querySelector("[data-delivery-confirmation]");

    if (deliveryDivisionField) {
      deliveryDivisionField.addEventListener("change", function () {
        clearCheckoutFieldErrors();
        updateDeliveryConfirmationState();
        renderCheckoutPage();
      });
    }

    if (deliveryConfirmationField) {
      deliveryConfirmationField.addEventListener("change", function () {
        renderCheckoutPage();
      });
    }

    placeOrderButton.addEventListener("click", function () {
      var cartItems = getCartDetails();
      var cartIssues = getCartIssues();

      if (!cartItems.length || cartIssues.length) {
        renderCheckoutPage();
        return;
      }

      var checkoutData = validateCheckoutFields();

      if (!checkoutData) {
        showToast("Please complete the required checkout details");
        renderCheckoutPage();
        return;
      }

      var order = buildOrderPayload(checkoutData, cartItems);
      var orders = getOrders();

      orders.unshift(order);
      saveOrders(orders);
      setLastOrderId(order.id);
      saveCart([]);
      updateCartCount();
      renderFeaturedProducts();

      if (shopUpdateGrid) {
        shopUpdateGrid();
      }

      showToast("Order request saved");
      submitOrderToNetlify(order);

      document.querySelector(".checkout-form").reset();
      clearCheckoutFieldErrors();
      document.querySelector('[data-delivery-area][value="Sylhet"]').checked = true;
      updateDeliveryConfirmationState();
      renderCheckoutPage();
    });

    if (paymentForm) {
      paymentForm.addEventListener("submit", function (event) {
        event.preventDefault();

        var order = findOrderById(getLastOrderId());
        var paymentMethodField = document.querySelector("[data-payment-method]");
        var transactionField = document.querySelector("[data-payment-transaction-id]");

        if (!order || !paymentMethodField || !transactionField) {
          showToast("Order information was not found");
          return;
        }

        if (!paymentMethodField.value || !transactionField.value.trim()) {
          showToast("Please complete the payment information");
          return;
        }

        updateOrderById(order.id, function (targetOrder) {
          targetOrder.payment = targetOrder.payment || {
            method: "Cash on Delivery"
          };
          targetOrder.payment.deliveryChargeMethod = paymentMethodField.value;
          targetOrder.payment.transactionId = transactionField.value.trim();
          targetOrder.payment.submittedAt = new Date().toISOString();

          if (
            targetOrder.status === "Pending Delivery Charge" ||
            targetOrder.status === "Payment Submitted"
          ) {
            targetOrder.status = "Payment Submitted";
          }
        });

        showToast("Payment information submitted");
        renderCheckoutPage();
      });
    }
  }

  function renderTrackResults(matches) {
    var resultsNode = document.querySelector("[data-track-results]");

    if (!resultsNode) {
      return;
    }

    if (!matches.length) {
      resultsNode.innerHTML =
        '<article class="panel empty-state">' +
          "<h3>No matching orders found.</h3>" +
          "<p>Check your order ID or phone number and try again.</p>" +
        "</article>";
      return;
    }

    resultsNode.innerHTML = matches.map(function (order) {
      return (
        '<article class="panel track-card">' +
          '<div class="track-card-head">' +
            "<div>" +
              "<strong>" + order.id + "</strong>" +
              "<p>" + formatOrderDate(order.createdAt) + "</p>" +
            "</div>" +
            '<span class="status-pill">' + order.status + "</span>" +
          "</div>" +
          '<div class="track-card-meta">' +
            "<p><strong>Phone:</strong> " + (order.phone || "-") + "</p>" +
            "<p><strong>Division:</strong> " + (order.deliveryDivision || "-") + "</p>" +
            "<p><strong>Delivery Location:</strong> " + (order.deliveryLocation || order.deliveryArea || "-") + "</p>" +
          "</div>" +
          '<div class="track-card-lines">' +
            getOrderItems(order).map(function (item) {
              return (
                '<div class="track-card-line">' +
                  "<strong>" + item.name + "</strong>" +
                  "<p>Size " + item.size + " / Qty " + item.quantity + "</p>" +
                "</div>"
              );
            }).join("") +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  function renderTrackOrderPage() {
    var form = document.querySelector("[data-track-form]");

    if (!form) {
      return;
    }

    var orderIdField = document.querySelector("[data-track-order-id]");
    var phoneField = document.querySelector("[data-track-phone]");
    var warningNode = document.querySelector("[data-track-warning]");

    form.onsubmit = function (event) {
      event.preventDefault();

      var orderId = orderIdField.value.trim().toLowerCase();
      var phone = phoneField.value.replace(/\D/g, "");

      if (!orderId && !phone) {
        warningNode.hidden = false;
        warningNode.className = "inventory-warning is-error";
        warningNode.textContent = "Enter an order ID or phone number to track your order.";
        return;
      }

      warningNode.hidden = true;
      warningNode.textContent = "";
      warningNode.className = "inventory-warning";

      var matches = getOrders().filter(function (order) {
        var orderMatches = orderId && String(order.id || "").toLowerCase() === orderId;
        var phoneMatches =
          phone &&
          String(order.phone || "").replace(/\D/g, "") === phone;

        return orderMatches || phoneMatches;
      });

      renderTrackResults(matches);
    };
  }

  ensureInventoryState();
  ensureShippingState();
  markActiveNav();
  setupMobileMenu();
  updateCartCount();
  renderFeaturedProducts();
  renderShopProducts();
  renderCartPage();
  renderCheckoutPage();
  initCheckoutPage();
  renderTrackOrderPage();

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (activeProductModal) {
        closeProductModal();
      }

      closeInfoModal();
    }
  });
})();
