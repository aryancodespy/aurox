import { ensureSupabaseConfig, getSupabaseClient } from "./supabase-config.js";

/*
  Main site script for Aurox.
  It keeps the frontend static, but loads live data from Supabase when
  configured. The cart still lives in localStorage for now, while products,
  inventory, orders, payments, and shipping settings come from Supabase.
*/

(function () {
  var supabaseReady = ensureSupabaseConfig();
  var supabase = getSupabaseClient();
  var defaultProducts = window.AUROX_PRODUCTS || [];
  var defaultInventory = window.AUROX_INVENTORY || {};
  var defaultShipping = window.AUROX_SHIPPING || {
    Sylhet: 70,
    "Outside Sylhet": 120
  };
  var cartKey = "aurox-cart";
  var lastOrderKey = "aurox-last-order-ref";
  var toastTimeout;
  var activeProductModal = null;
  var shopUpdateGrid = null;
  var sizeGuideRows = [
    { size: "M", length: '27"', chest: '38"' },
    { size: "L", length: '28"', chest: '40"' },
    { size: "XL", length: '29"', chest: '42"' }
  ];
  var productsCache = [];
  var categoriesCache = [];
  var shippingSettingsCache = cloneObject(defaultShipping);

  function cloneObject(value) {
    return JSON.parse(JSON.stringify(value));
  }

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

  function getDefaultCatalog() {
    return cloneObject(defaultProducts).map(function (product) {
      var stock = defaultInventory[product.id] || { M: 0, L: 0, XL: 0 };
      return {
        id: product.id,
        slug: product.slug || product.id,
        name: product.name,
        category: product.category,
        categorySlug: slugifyValue(product.category),
        type: product.type || product.category || "Unisex T-Shirt",
        color: product.color,
        material: product.material,
        price: Number(product.price) || 0,
        image: product.image,
        alt: product.alt,
        shortDescription: product.shortDescription || product.description,
        description: product.description,
        highlights: product.highlights || [],
        seoTitle: product.seoTitle || "",
        seoDescription: product.seoDescription || "",
        popularity: product.popularity || 80,
        isNew: Boolean(product.isNew),
        status: product.status || "active",
        active: product.active !== false,
        sizes: ["M", "L", "XL"],
        stock: {
          M: Number(stock.M) || 0,
          L: Number(stock.L) || 0,
          XL: Number(stock.XL) || 0
        }
      };
    });
  }

  function getDefaultCategories() {
    var catalog = getDefaultCatalog();
    var categoryMap = {};

    catalog.forEach(function (product) {
      if (!categoryMap[product.category]) {
        categoryMap[product.category] = {
          id: slugifyValue(product.category),
          name: product.category,
          slug: slugifyValue(product.category),
          description: product.type === "Unisex T-Shirt"
            ? "Premium Aurox essentials with more collections coming soon."
            : "Aurox collection",
          count: 0,
          is_active: true
        };
      }
      categoryMap[product.category].count += 1;
    });

    return Object.keys(categoryMap).map(function (key) {
      return categoryMap[key];
    });
  }

  function slugifyValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
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

  function setLastOrderRef(orderRef) {
    localStorage.setItem(lastOrderKey, JSON.stringify(orderRef));
  }

  function getLastOrderRef() {
    try {
      var rawRef = localStorage.getItem(lastOrderKey);
      return rawRef ? JSON.parse(rawRef) : null;
    } catch (error) {
      return null;
    }
  }

  function getProducts() {
    return productsCache.filter(function (product) {
      return product.active !== false && product.status !== "archived";
    });
  }

  function getCategories() {
    if (categoriesCache.length) {
      return categoriesCache.filter(function (category) {
        return category.is_active !== false;
      });
    }
    return getDefaultCategories();
  }

  function getProductById(id) {
    return productsCache.find(function (product) {
      return product.id === id;
    }) || null;
  }

  function mapInventoryRows(rows) {
    var stockByProduct = {};

    rows.forEach(function (row) {
      if (!stockByProduct[row.product_id]) {
        stockByProduct[row.product_id] = { M: 0, L: 0, XL: 0 };
      }

      stockByProduct[row.product_id][row.size] = Number(row.stock_quantity) || 0;
    });

    return stockByProduct;
  }

  function getPrimaryImage(product) {
    if (product.product_images && product.product_images.length) {
      var primaryImage = product.product_images.find(function (image) {
        return image.is_primary;
      }) || product.product_images[0];

      return primaryImage
        ? {
            url: primaryImage.image_url,
            storagePath: primaryImage.storage_path || ""
          }
        : { url: "", storagePath: "" };
    }

    return { url: "", storagePath: "" };
  }

  async function loadProductsFromSupabase() {
    if (!supabaseReady || !supabase) {
      return getDefaultCatalog();
    }

    var productResponse = await supabase
      .from("products")
      .select("id, name, slug, color, material, price, short_description, description, product_highlights, seo_title, seo_description, status, is_active, created_at, categories(name, slug), product_images(image_url, is_primary, storage_path)")
      .order("created_at", { ascending: false });

    if (productResponse.error || !productResponse.data) {
      return getDefaultCatalog();
    }

    if (!productResponse.data.length) {
      return [];
    }

    var productIds = productResponse.data.map(function (product) {
      return product.id;
    });
    var inventoryResponse = await supabase
      .from("inventory")
      .select("product_id, size, stock_quantity")
      .in("product_id", productIds);
    var stockByProduct = mapInventoryRows(inventoryResponse.data || []);

    return productResponse.data.map(function (product) {
      var stock = stockByProduct[product.id] || { M: 0, L: 0, XL: 0 };
      var categoryName = product.categories && product.categories.name
        ? product.categories.name
        : "Unisex T-Shirt";
      var image = getPrimaryImage(product);
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        category: categoryName,
        categorySlug: product.categories && product.categories.slug
          ? product.categories.slug
          : slugifyValue(categoryName),
        type: categoryName || "Unisex T-Shirt",
        color: product.color,
        material: product.material,
        price: Number(product.price) || 0,
        image: image.url || "images/product-1.svg",
        imagePath: image.storagePath || "",
        alt: product.name + " " + String(product.color || "").toLowerCase() + " Aurox product image",
        shortDescription: product.short_description || product.description,
        description: product.description,
        highlights: Array.isArray(product.product_highlights) ? product.product_highlights : [],
        seoTitle: product.seo_title || "",
        seoDescription: product.seo_description || "",
        popularity: 80,
        isNew: false,
        status: product.status || "active",
        active: product.is_active !== false,
        sizes: ["M", "L", "XL"],
        stock: {
          M: Number(stock.M) || 0,
          L: Number(stock.L) || 0,
          XL: Number(stock.XL) || 0
        }
      };
    });
  }

  async function loadCategoriesFromSupabase() {
    if (!supabaseReady || !supabase) {
      return getDefaultCategories();
    }

    var response = await supabase
      .from("categories")
      .select("id, name, slug, description, is_active, created_at")
      .order("created_at", { ascending: false });

    if (response.error || !response.data || !response.data.length) {
      return getProductsDerivedCategories();
    }

    return response.data.map(function (category) {
      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        is_active: category.is_active !== false,
        count: productsCache.filter(function (product) {
          return product.category === category.name;
        }).length
      };
    });
  }

  function getProductsDerivedCategories() {
    return getProducts().reduce(function (list, product) {
      var existing = list.find(function (category) {
        return category.name === product.category;
      });

      if (existing) {
        existing.count += 1;
        return list;
      }

      list.push({
        id: product.categorySlug || slugifyValue(product.category),
        name: product.category,
        slug: product.categorySlug || slugifyValue(product.category),
        description: "Premium Aurox collection with more categories coming soon.",
        is_active: true,
        count: 1
      });
      return list;
    }, []);
  }

  async function loadShippingSettingsFromSupabase() {
    if (!supabaseReady || !supabase) {
      return cloneObject(defaultShipping);
    }

    var response = await supabase
      .from("shipping_settings")
      .select("location_name, charge");

    if (response.error || !response.data) {
      return cloneObject(defaultShipping);
    }

    var settings = cloneObject(defaultShipping);
    response.data.forEach(function (row) {
      settings[row.location_name] = Number(row.charge) || 0;
    });
    return settings;
  }

  async function refreshSupabaseData() {
    productsCache = await loadProductsFromSupabase();
    categoriesCache = await loadCategoriesFromSupabase();
    shippingSettingsCache = await loadShippingSettingsFromSupabase();
  }

  function getReservedCartQuantity(productId, size) {
    return getCart().reduce(function (total, item) {
      if (item.productId === productId && item.size === size) {
        return total + item.quantity;
      }
      return total;
    }, 0);
  }

  function getInventoryTotal(productId, size) {
    var product = getProductById(productId);
    return product && product.stock ? Number(product.stock[size]) || 0 : 0;
  }

  function getSizeStock(productId, size) {
    return Math.max(0, getInventoryTotal(productId, size) - getReservedCartQuantity(productId, size));
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
    return Number(shippingSettingsCache[location] || 0);
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

  function buildWhatsAppOrderLink(orderNumber) {
    var message =
      "Hello Aurox, I placed an order. My Order ID is " +
      orderNumber +
      ". I want to pay the delivery charge and confirm my order.";
    return "https://wa.me/?text=" + encodeURIComponent(message);
  }

  async function submitOrderNotificationForm(orderPayload) {
    var form = document.querySelector("[data-netlify-order-form]");
    if (!form) {
      return;
    }

    var fieldMap = {
      order_id: orderPayload.orderNumber,
      customer_name: orderPayload.customerName,
      phone: orderPayload.phone,
      address: orderPayload.address,
      division: orderPayload.deliveryDivision,
      delivery_location: orderPayload.deliveryLocation,
      products: orderPayload.items.map(function (item) { return item.productName; }).join(", "),
      sizes: orderPayload.items.map(function (item) { return item.size; }).join(", "),
      quantities: orderPayload.items.map(function (item) { return item.quantity; }).join(", "),
      product_total: String(orderPayload.productTotal),
      delivery_charge: String(orderPayload.deliveryCharge),
      status: orderPayload.status,
      order_json: JSON.stringify(orderPayload)
    };

    Object.keys(fieldMap).forEach(function (key) {
      var input = form.querySelector('[name="' + key + '"]');
      if (input) {
        input.value = fieldMap[key];
      }
    });

    try {
      await fetch("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(new FormData(form)).toString()
      });
    } catch (error) {
      // Netlify form notification is best-effort and should not block checkout.
    }
  }

  function getSizeGuideTableMarkup() {
    return (
      '<table class="size-guide-table">' +
        "<thead><tr><th>Size</th><th>Length</th><th>Chest</th></tr></thead>" +
        "<tbody>" +
          sizeGuideRows.map(function (row) {
            return (
              "<tr><td>" + row.size + "</td><td>" + row.length + "</td><td>" + row.chest + "</td></tr>"
            );
          }).join("") +
        "</tbody>" +
      "</table>"
    );
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

  function getCartIssues() {
    return getCartDetails().filter(function (item) {
      return item.quantity > getInventoryTotal(item.product.id, item.size);
    });
  }

  function getCartTotals() {
    var items = getCartDetails();
    var subtotal = items.reduce(function (total, item) {
      return total + item.lineTotal;
    }, 0);
    return {
      items: items,
      subtotal: subtotal
    };
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

  async function refreshStoreViews() {
    await refreshSupabaseData();
    renderFeaturedCollections();
    renderFeaturedProducts();
    if (shopUpdateGrid) {
      shopUpdateGrid();
    }
    renderCartPage();
    renderCheckoutPage();
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
    renderFeaturedProducts();
    if (shopUpdateGrid) {
      shopUpdateGrid();
    }
    renderCartPage();
    renderCheckoutPage();
    showToast("Item added to cart");
    return true;
  }

  function removeFromCart(productId, size) {
    var updatedCart = getCart().filter(function (item) {
      return !(item.productId === productId && item.size === size);
    });

    saveCart(updatedCart);
    updateCartCount();
    renderFeaturedProducts();
    if (shopUpdateGrid) {
      shopUpdateGrid();
    }
    renderCartPage();
    renderCheckoutPage();
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
    renderFeaturedProducts();
    if (shopUpdateGrid) {
      shopUpdateGrid();
    }
    renderCartPage();
    renderCheckoutPage();
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
    var sylhetLabel = document.querySelector('[data-delivery-price-label="Sylhet"]');
    var outsideLabel = document.querySelector('[data-delivery-price-label="Outside Sylhet"]');

    if (sylhetLabel) {
      sylhetLabel.textContent = "Delivery charge / " + formatPrice(shippingSettingsCache.Sylhet);
    }
    if (outsideLabel) {
      outsideLabel.textContent = "Delivery charge / " + formatPrice(shippingSettingsCache["Outside Sylhet"]);
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
          '<div class="product-modal-media"><img src="" alt="" data-modal-image></div>' +
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
              '<div class="size-guide-head"><strong>Size Guide</strong><button class="size-guide-link" type="button" data-open-size-guide>Open full guide</button></div>' +
              getSizeGuideTableMarkup() +
            "</div>" +
            '<p class="modal-stock-text" data-modal-stock></p>' +
            '<div class="product-modal-actions">' +
              '<div class="product-option-group"><label for="product-size-select">Size</label><select id="product-size-select" data-modal-size></select></div>' +
              '<div class="product-option-group"><label for="product-quantity-select">Quantity</label><div class="modal-quantity-control"><button type="button" data-modal-quantity-decrease>-</button><input id="product-quantity-select" type="number" min="1" value="1" data-modal-quantity><button type="button" data-modal-quantity-increase>+</button></div></div>' +
            "</div>" +
            '<div class="product-modal-buttons"><button class="button button-dark" type="button" data-modal-add-to-cart>Add to Cart</button><button class="button button-light" type="button" data-close-product-modal>Back to Shop</button></div>' +
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
    stockText.className = "modal-stock-text" + (selectedStock <= 0 ? " modal-stock-out" : "");
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
    sizeSelect.innerHTML = product.sizes.map(function (size) {
      var sizeStock = getSizeStock(product.id, size);
      return (
        '<option value="' + size + '"' + (sizeStock <= 0 ? " disabled" : "") + ">" +
        size + (sizeStock <= 0 ? " - Out of stock" : "") + "</option>"
      );
    }).join("");
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
      var wasAdded = addToCart(productId, sizeSelect.value, Number(quantityInput.value) || 1);
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

    container.innerHTML = getProducts().slice(0, 4).map(createProductCard).join("");
    bindAddToCartButtons();
    bindViewProductButtons();
    bindSizeGuideButtons();
  }

  function renderFeaturedCollections() {
    var container = document.querySelector("[data-featured-collections]");
    if (!container) {
      return;
    }

    var collections = getCategories().slice(0, 4);

    if (!collections.length) {
      container.innerHTML =
        '<article class="collection-card"><span>01</span><h3>More collections coming soon</h3><p>Aurox is starting with premium essentials and growing toward a complete clothing line.</p></article>';
      return;
    }

    container.innerHTML = collections.map(function (category, index) {
      var numberLabel = String(index + 1).padStart(2, "0");
      var countText = category.count
        ? category.count + " product" + (category.count === 1 ? "" : "s")
        : "New collection";

      return (
        '<article class="collection-card">' +
          "<span>" + numberLabel + "</span>" +
          "<h3>" + category.name + "</h3>" +
          "<p>" + (category.description || "Premium Aurox collection.") + " " + countText + " available.</p>" +
        "</article>"
      );
    }).join("");
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
      var activeProducts = getProducts();
      var highestPrice = activeProducts.reduce(function (max, product) {
        return Math.max(max, Number(product.price) || 0);
      }, 500);
      var priceMax = Math.max(500, Math.ceil(highestPrice / 50) * 50);
      var selectedCategory = categoryFilter.value || "All";
      var selectedSize = sizeFilter.value || "All";
      var searchText = searchInput.value.trim().toLowerCase();
      priceFilter.max = String(priceMax);
      if (!priceFilter.dataset.userChanged) {
        priceFilter.value = String(priceMax);
      }
      var maxPrice = Number(priceFilter.value);
      var sortValue = sortFilter.value;

      var categoryOptions = ["All"].concat(
        getCategories().reduce(function (list, category) {
          if (list.indexOf(category.name) === -1) {
            list.push(category.name);
          }
          return list;
        }, []),
      );

      categoryFilter.innerHTML = categoryOptions.map(function (category) {
        return '<option value="' + category + '">' + category + "</option>";
      }).join("");

      if (categoryOptions.indexOf(selectedCategory) > -1) {
        categoryFilter.value = selectedCategory;
      }

      priceValue.textContent = maxPrice + " BDT";

      var filteredProducts = activeProducts.filter(function (product) {
        var matchesSearch = product.name.toLowerCase().indexOf(searchText) > -1;
        var matchesCategory =
          categoryFilter.value === "All" || product.category === categoryFilter.value;
        var matchesSize = selectedSize === "All" || product.sizes.indexOf(selectedSize) > -1;
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
          return (second.popularity || 0) - (first.popularity || 0);
        }
        return Number(Boolean(second.isNew)) - Number(Boolean(first.isNew));
      });

      countLabel.textContent = filteredProducts.length;

      if (!filteredProducts.length) {
        container.innerHTML =
          '<div class="panel empty-state"><h3>No products found</h3><p>Try adjusting your filters to explore more premium tees and upcoming Aurox drops.</p></div>';
      } else {
        container.innerHTML = filteredProducts.map(createProductCard).join("");
      }

      bindAddToCartButtons();
      bindViewProductButtons();
      bindSizeGuideButtons();
    };

    if (!container.dataset.filtersBound) {
      [searchInput, categoryFilter, sizeFilter, priceFilter, sortFilter].forEach(function (field) {
        field.addEventListener("input", function () {
          if (field === priceFilter) {
            priceFilter.dataset.userChanged = "true";
          }
          shopUpdateGrid();
        });
        field.addEventListener("change", function () {
          if (field === priceFilter) {
            priceFilter.dataset.userChanged = "true";
          }
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
        '<article class="panel empty-state"><h3>Your cart is empty.</h3><p>Start with premium unisex t-shirts from the current Aurox collection.</p><a class="button button-dark" href="shop.html">Continue Shopping</a></article>';
    } else {
      itemsContainer.innerHTML = totals.items.map(function (item) {
        var maxAllowed = getInventoryTotal(item.product.id, item.size);
        var lineWarning = item.quantity > maxAllowed
          ? '<p class="inventory-warning is-error">Available stock for size ' + item.size + " is now " + maxAllowed + ".</p>"
          : "";
        return (
          '<article class="panel cart-item">' +
            '<img class="cart-item-image" src="' + item.product.image + '" alt="' + item.product.alt + '">' +
            '<div class="cart-item-body">' +
              '<div class="cart-item-top"><div><h3>' + item.product.name + '</h3><p>Size: ' + item.size + " / Color: " + item.product.color + " / " + item.product.material + "</p>" + lineWarning + '</div><strong>' + formatPrice(item.product.price) + "</strong></div>" +
              '<div class="cart-item-actions"><div class="quantity-control"><button type="button" data-decrease="' + item.product.id + '" data-size="' + item.size + '">-</button><strong>' + item.quantity + '</strong><button type="button" data-increase="' + item.product.id + '" data-size="' + item.size + '"' + (item.quantity >= maxAllowed ? " disabled" : "") + ">+</button></div><button class=\"remove-button\" type=\"button\" data-remove=\"" + item.product.id + '" data-size="' + item.size + '">Remove</button></div>' +
            "</div></article>"
        );
      }).join("");
    }

    subtotalNode.textContent = formatPrice(totals.subtotal);
    shippingNode.textContent = formatPrice(0);
    totalNode.textContent = formatPrice(totals.subtotal);

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
        removeFromCart(button.getAttribute("data-remove"), button.getAttribute("data-size"));
      });
    });
  }

  async function fetchOrderByPublicId(orderId) {
    if (!supabaseReady || !supabase || !orderId) {
      return null;
    }

    var orderResponse = await supabase.rpc("track_orders", {
      search_order_number: orderId,
      search_phone: null
    });

    if (orderResponse.error || !orderResponse.data || !orderResponse.data.length) {
      return null;
    }

    return orderResponse.data[0];
  }

  async function renderCheckoutSuccessState() {
    var successNode = document.querySelector("[data-checkout-success]");
    if (!successNode) {
      return;
    }

    var lastOrderRef = getLastOrderRef();
    if (!lastOrderRef || !lastOrderRef.orderId) {
      successNode.hidden = true;
      return;
    }

    var order = await fetchOrderByPublicId(lastOrderRef.orderId);
    if (!order) {
      successNode.hidden = true;
      return;
    }

    successNode.hidden = false;

    var orderIdNode = successNode.querySelector("[data-last-order-id]");
    var paymentForm = successNode.querySelector("[data-payment-submit-form]");
    var paymentMessage = successNode.querySelector("[data-payment-submit-message]");
    var paymentMethodField = successNode.querySelector("[data-payment-method]");
    var transactionField = successNode.querySelector("[data-payment-transaction-id]");

    if (orderIdNode) {
      orderIdNode.textContent = order.order_number;
    }
    var whatsappButton = successNode.querySelector("[data-whatsapp-order-link]");
    if (whatsappButton) {
      whatsappButton.setAttribute("href", buildWhatsAppOrderLink(order.order_number));
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
        paymentMessage.textContent = "Payment information submitted successfully. We will verify your delivery charge and update the order soon.";
      } else if (
        order.status === "Confirmed" ||
        order.status === "Processing" ||
        order.status === "Shipped" ||
        order.status === "Delivered"
      ) {
        paymentMessage.textContent = "Delivery charge received. Current order status: " + order.status + ".";
      } else if (order.status === "Cancelled") {
        paymentMessage.textContent = "This order has been cancelled. If you need help, please contact Aurox support.";
      } else {
        paymentMessage.textContent = "After payment, submit your transaction ID and payment method below.";
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
          '<article class="checkout-product"><img src="' + item.product.image + '" alt="' + item.product.alt + '"><div><strong>' + item.product.name + "</strong><p>Qty " + item.quantity + " / Size " + item.size + '</p></div><strong>' + formatPrice(item.lineTotal) + "</strong></article>"
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
        warningNode.hidden = Boolean(getLastOrderRef());
        warningNode.className = "inventory-warning";
        warningNode.textContent = warningNode.hidden ? "" : "Add products to your cart before placing an order.";
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
        productName: item.product.name,
        size: item.size,
        quantity: item.quantity,
        price: item.product.price
      };
    });

    var productTotal = items.reduce(function (total, item) {
      return total + item.price * item.quantity;
    }, 0);

    return {
      orderNumber: generateOrderId(),
      customerName: checkoutData.customerName,
      phone: checkoutData.phone,
      email: checkoutData.email,
      address: checkoutData.address,
      deliveryDivision: checkoutData.deliveryDivision,
      deliveryLocation: checkoutData.deliveryLocation,
      productTotal: productTotal,
      deliveryCharge: deliveryCharge,
      amountToPayNow: deliveryCharge,
      amountToPayOnDelivery: productTotal,
      status: "Pending Delivery Charge",
      items: items
    };
  }

  async function saveOrderToSupabase(orderPayload) {
    if (!supabaseReady || !supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    var orderInsert = await supabase
      .from("orders")
      .insert({
        order_number: orderPayload.orderNumber,
        customer_name: orderPayload.customerName,
        phone: orderPayload.phone,
        address: orderPayload.address,
        division: orderPayload.deliveryDivision,
        delivery_location: orderPayload.deliveryLocation,
        product_total: orderPayload.productTotal,
        delivery_charge: orderPayload.deliveryCharge,
        amount_to_pay_now: orderPayload.amountToPayNow,
        amount_to_pay_on_delivery: orderPayload.amountToPayOnDelivery,
        status: orderPayload.status
      })
      .select("id, order_number")
      .single();

    if (orderInsert.error || !orderInsert.data) {
      throw orderInsert.error || new Error("Could not save the order.");
    }

    var orderItemRows = orderPayload.items.map(function (item) {
      return {
        order_id: orderInsert.data.id,
        product_id: item.productId,
        product_name: item.productName,
        size: item.size,
        quantity: item.quantity,
        price: item.price
      };
    });

    var itemInsert = await supabase.from("order_items").insert(orderItemRows);
    if (itemInsert.error) {
      throw itemInsert.error;
    }

    return {
      id: orderInsert.data.id,
      orderId: orderInsert.data.order_number
    };
  }

  async function submitPaymentToSupabase(orderRef, paymentMethod, transactionId, deliveryCharge) {
    if (!supabaseReady || !supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    var paymentInsert = await supabase.from("payments").insert({
      order_id: orderRef.id,
      payment_method: paymentMethod,
      transaction_id: transactionId,
      amount: deliveryCharge,
      status: "Payment Submitted"
    });

    if (paymentInsert.error) {
      throw paymentInsert.error;
    }

    var orderUpdate = await supabase
      .from("orders")
      .update({ status: "Payment Submitted" })
      .eq("id", orderRef.id);

    if (orderUpdate.error) {
      throw orderUpdate.error;
    }
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

    placeOrderButton.addEventListener("click", async function () {
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

      try {
        var orderPayload = buildOrderPayload(checkoutData, cartItems);
        var savedOrder = await saveOrderToSupabase(orderPayload);
        await submitOrderNotificationForm(orderPayload);
        setLastOrderRef(savedOrder);
        saveCart([]);
        updateCartCount();
        document.querySelector(".checkout-form").reset();
        clearCheckoutFieldErrors();
        document.querySelector('[data-delivery-area][value="Sylhet"]').checked = true;
        updateDeliveryConfirmationState();
        await refreshStoreViews();
        showToast("Order request saved");
      } catch (error) {
        showToast(error && error.message ? error.message : "Could not save the order");
      }
    });

    if (paymentForm) {
      paymentForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        var orderRef = getLastOrderRef();
        var paymentMethodField = document.querySelector("[data-payment-method]");
        var transactionField = document.querySelector("[data-payment-transaction-id]");
        var shippingNode = document.querySelector("[data-checkout-shipping]");

        if (!orderRef || !paymentMethodField || !transactionField) {
          showToast("Order information was not found");
          return;
        }

        if (!paymentMethodField.value || !transactionField.value.trim()) {
          showToast("Please complete the payment information");
          return;
        }

        try {
          await submitPaymentToSupabase(
            orderRef,
            paymentMethodField.value,
            transactionField.value.trim(),
            Number(String(shippingNode.textContent || "0").replace(/[^\d.]/g, "")) || 0,
          );
          showToast("Payment information submitted");
          await renderCheckoutSuccessState();
        } catch (error) {
          showToast(error && error.message ? error.message : "Could not submit payment");
        }
      });
    }
  }

  async function fetchTrackingResults(searchOrderId, searchPhone) {
    if (!supabaseReady || !supabase) {
      return [];
    }

    var response = await supabase.rpc("track_orders", {
      search_order_number: searchOrderId || null,
      search_phone: searchPhone || null
    });

    if (response.error || !response.data || !response.data.length) {
      return [];
    }

    var orderIds = response.data.map(function (order) {
      return order.id;
    });
    var itemResponse = await supabase.rpc("track_order_items", {
      order_ids: orderIds
    });

    var itemsByOrder = {};
    (itemResponse.data || []).forEach(function (item) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }
      itemsByOrder[item.order_id].push(item);
    });

    return response.data.map(function (order) {
      order.items = itemsByOrder[order.id] || [];
      return order;
    });
  }

  function renderTrackResults(matches) {
    var resultsNode = document.querySelector("[data-track-results]");
    if (!resultsNode) {
      return;
    }

    if (!matches.length) {
      resultsNode.innerHTML =
        '<article class="panel empty-state"><h3>No matching orders found.</h3><p>Check your order ID or phone number and try again.</p></article>';
      return;
    }

    resultsNode.innerHTML = matches.map(function (order) {
      return (
        '<article class="panel track-card">' +
          '<div class="track-card-head"><div><strong>' + order.order_number + "</strong><p>" + formatOrderDate(order.created_at) + '</p></div><span class="status-pill">' + order.status + "</span></div>" +
          '<div class="track-card-meta"><p><strong>Phone:</strong> ' + (order.phone || "-") + "</p><p><strong>Division:</strong> " + (order.division || "-") + "</p><p><strong>Delivery Location:</strong> " + (order.delivery_location || "-") + "</p></div>" +
          '<div class="track-card-lines">' +
            (order.items || []).map(function (item) {
              return '<div class="track-card-line"><strong>' + item.product_name + "</strong><p>Size " + item.size + " / Qty " + item.quantity + "</p></div>";
            }).join("") +
          "</div></article>"
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

    form.onsubmit = async function (event) {
      event.preventDefault();

      var orderId = orderIdField.value.trim();
      var phone = phoneField.value.trim();

      if (!orderId && !phone) {
        warningNode.hidden = false;
        warningNode.className = "inventory-warning is-error";
        warningNode.textContent = "Enter an order ID or phone number to track your order.";
        return;
      }

      warningNode.hidden = true;
      warningNode.textContent = "";
      warningNode.className = "inventory-warning";

      var matches = await fetchTrackingResults(orderId, phone);
      renderTrackResults(matches);
    };
  }

  async function initSite() {
    await refreshSupabaseData();
    markActiveNav();
    setupMobileMenu();
    updateCartCount();
    renderFeaturedCollections();
    renderFeaturedProducts();
    renderShopProducts();
    renderCartPage();
    renderCheckoutPage();
    initCheckoutPage();
    renderTrackOrderPage();
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (activeProductModal) {
        closeProductModal();
      }
      closeInfoModal();
    }
  });

  initSite();
})();
