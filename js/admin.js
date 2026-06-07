import {
  ensureSupabaseConfig,
  getSupabaseClient,
  SUPABASE_STORAGE_BUCKET
} from "./supabase-config.js";

/*
  Admin dashboard for Aurox.
  Everything here is driven by Supabase so products, categories, inventory,
  orders, shipping settings, and payment submissions can be managed without
  editing the site code.
*/

(function () {
  var supabaseReady = ensureSupabaseConfig();
  var supabase = getSupabaseClient();
  var defaultShipping = window.AUROX_SHIPPING || {
    Sylhet: 70,
    "Outside Sylhet": 120
  };
  var successTimeout;
  var orderStatusOptions = [
    "Pending Delivery Charge",
    "Payment Submitted",
    "Confirmed",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled"
  ];
  var paymentStatusOptions = [
    "Payment Submitted",
    "Verified",
    "Rejected"
  ];
  var adminState = {
    categories: [],
    products: [],
    inventory: {},
    orders: [],
    payments: [],
    shipping: {
      Sylhet: defaultShipping.Sylhet,
      "Outside Sylhet": defaultShipping["Outside Sylhet"]
    }
  };

  function formatPrice(value) {
    return Math.round(Number(value) || 0) + " BDT";
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function setText(selector, value) {
    var node = document.querySelector(selector);
    if (node) {
      node.textContent = value;
    }
  }

  function setError(selector, message) {
    setText(selector, message || "");
  }

  function clearErrors() {
    [
      "[data-admin-product-error]",
      "[data-admin-category-error]",
      "[data-admin-image-error]",
      "[data-admin-login-error]"
    ].forEach(function (selector) {
      setError(selector, "");
    });
  }

  function isProductVisible(product) {
    return product.status !== "archived";
  }

  function getInventoryForProduct(productId) {
    return adminState.inventory[productId] || { M: 0, L: 0, XL: 0 };
  }

  function getCategoryName(product) {
    if (product.categories && product.categories.name) {
      return product.categories.name;
    }
    return product.category || "Uncategorized";
  }

  function getCategoryById(categoryId) {
    return adminState.categories.find(function (category) {
      return category.id === categoryId;
    }) || null;
  }

  function getStockNotice(value) {
    var total = Number(value) || 0;

    if (total <= 0) {
      return { text: "Warning: Out of Stock", className: "is-out" };
    }
    if (total <= 5) {
      return { text: "Warning: Only " + total + " left", className: "is-low" };
    }
    return { text: "In stock", className: "" };
  }

  function getPrimaryImage(product) {
    if (product.product_images && product.product_images.length) {
      var primaryImage = product.product_images.find(function (image) {
        return image.is_primary;
      }) || product.product_images[0];
      return primaryImage || null;
    }

    return null;
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

  function getConfirmedRevenue() {
    return adminState.orders.reduce(function (total, order) {
      if (["Confirmed", "Processing", "Shipped", "Delivered"].indexOf(order.status) > -1) {
        return total + Number(order.product_total || 0);
      }
      return total;
    }, 0);
  }

  function getOrderItemsQuantity(order) {
    return (order.items || []).reduce(function (total, item) {
      return total + Number(item.quantity || 0);
    }, 0);
  }

  function getBestSellingProducts() {
    var totals = {};

    adminState.orders.forEach(function (order) {
      if (["Confirmed", "Processing", "Shipped", "Delivered"].indexOf(order.status) === -1) {
        return;
      }

      (order.items || []).forEach(function (item) {
        if (!totals[item.product_name]) {
          totals[item.product_name] = 0;
        }
        totals[item.product_name] += Number(item.quantity || 0);
      });
    });

    return Object.keys(totals)
      .map(function (name) {
        return {
          name: name,
          quantity: totals[name]
        };
      })
      .sort(function (first, second) {
        return second.quantity - first.quantity;
      })
      .slice(0, 5);
  }

  function getOrdersThisMonth() {
    var now = new Date();
    return adminState.orders.filter(function (order) {
      var createdAt = new Date(order.created_at);
      return (
        createdAt.getFullYear() === now.getFullYear() &&
        createdAt.getMonth() === now.getMonth()
      );
    }).length;
  }

  function buildTemplateHighlights(name, material, category) {
    return [
      "Premium " + material + " build for everyday wear",
      "Clean " + category.toLowerCase() + " silhouette with versatile styling",
      "Designed by Aurox for confidence, comfort, and repeat use"
    ];
  }

  function generateAiCopy(input) {
    var productName = input.name || "Aurox Product";
    var material = input.material || "premium cotton";
    var category = input.categoryName || "everyday essential";
    var shortDescription =
      productName + " is a refined " + category.toLowerCase() + " in " + material.toLowerCase() + ", designed for modern, versatile styling.";
    var fullDescription =
      productName + " brings together a premium feel, clean structure, and a fashion-forward everyday presence. Crafted in " +
      material.toLowerCase() +
      ", this Aurox piece is built for confident wear, easy layering, and a polished look that fits the evolving brand direction.";
    var highlights = buildTemplateHighlights(productName, material, category);
    var seoTitle = productName + " | Aurox";
    var seoDescription =
      "Shop " + productName + " from Aurox. " + shortDescription;

    return {
      shortDescription: shortDescription,
      description: fullDescription,
      highlights: highlights,
      seoTitle: seoTitle,
      seoDescription: seoDescription
    };
  }

  function mapInventoryRows(rows) {
    var inventoryMap = {};

    (rows || []).forEach(function (row) {
      if (!inventoryMap[row.product_id]) {
        inventoryMap[row.product_id] = { M: 0, L: 0, XL: 0 };
      }
      inventoryMap[row.product_id][row.size] = Number(row.stock_quantity) || 0;
    });

    return inventoryMap;
  }

  async function fetchCategories() {
    var response = await supabase
      .from("categories")
      .select("id, name, slug, description, is_active, created_at")
      .order("created_at", { ascending: false });

    if (response.error) {
      throw response.error;
    }

    adminState.categories = response.data || [];
  }

  async function fetchProducts() {
    var response = await supabase
      .from("products")
      .select("id, category_id, name, slug, color, material, price, short_description, description, product_highlights, seo_title, seo_description, status, is_active, created_at, categories(id, name, slug), product_images(id, image_url, is_primary, storage_path)")
      .order("created_at", { ascending: false });

    if (response.error) {
      throw response.error;
    }

    adminState.products = response.data || [];

    if (!adminState.products.length) {
      adminState.inventory = {};
      return;
    }

    var inventoryResponse = await supabase
      .from("inventory")
      .select("product_id, size, stock_quantity")
      .in("product_id", adminState.products.map(function (product) {
        return product.id;
      }));

    if (inventoryResponse.error) {
      throw inventoryResponse.error;
    }

    adminState.inventory = mapInventoryRows(inventoryResponse.data || []);
  }

  async function fetchOrdersAndPayments() {
    var ordersResponse = await supabase
      .from("orders")
      .select("id, order_number, customer_name, phone, address, division, delivery_location, product_total, delivery_charge, amount_to_pay_now, amount_to_pay_on_delivery, status, created_at")
      .order("created_at", { ascending: false });

    if (ordersResponse.error) {
      throw ordersResponse.error;
    }

    var orderIds = (ordersResponse.data || []).map(function (order) {
      return order.id;
    });

    var itemsResponse = orderIds.length
      ? await supabase
          .from("order_items")
          .select("id, order_id, product_id, product_name, size, quantity, price")
          .in("order_id", orderIds)
      : { data: [], error: null };

    if (itemsResponse.error) {
      throw itemsResponse.error;
    }

    var paymentsResponse = await supabase
      .from("payments")
      .select("id, order_id, payment_method, transaction_id, amount, status, created_at")
      .order("created_at", { ascending: false });

    if (paymentsResponse.error) {
      throw paymentsResponse.error;
    }

    var itemsByOrder = {};
    (itemsResponse.data || []).forEach(function (item) {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }
      itemsByOrder[item.order_id].push(item);
    });

    var paymentsByOrder = {};
    (paymentsResponse.data || []).forEach(function (payment) {
      if (!paymentsByOrder[payment.order_id]) {
        paymentsByOrder[payment.order_id] = [];
      }
      paymentsByOrder[payment.order_id].push(payment);
    });

    adminState.orders = (ordersResponse.data || []).map(function (order) {
      order.items = itemsByOrder[order.id] || [];
      order.payments = paymentsByOrder[order.id] || [];
      return order;
    });
    adminState.payments = paymentsResponse.data || [];
  }

  async function fetchShippingSettings() {
    var response = await supabase
      .from("shipping_settings")
      .select("id, location_name, charge");

    if (response.error) {
      throw response.error;
    }

    adminState.shipping = {
      Sylhet: defaultShipping.Sylhet,
      "Outside Sylhet": defaultShipping["Outside Sylhet"]
    };

    (response.data || []).forEach(function (row) {
      adminState.shipping[row.location_name] = Number(row.charge) || 0;
    });

    var sylhetInput = document.querySelector('[data-shipping-input="Sylhet"]');
    var outsideInput = document.querySelector('[data-shipping-input="Outside Sylhet"]');

    if (sylhetInput) {
      sylhetInput.value = adminState.shipping.Sylhet;
    }
    if (outsideInput) {
      outsideInput.value = adminState.shipping["Outside Sylhet"];
    }
  }

  async function refreshAdminData() {
    await Promise.all([
      fetchCategories(),
      fetchProducts(),
      fetchOrdersAndPayments(),
      fetchShippingSettings()
    ]);
  }

  function populateCategoryOptions(selectedId) {
    var select = document.querySelector('[data-product-field="categoryId"]');
    if (!select) {
      return;
    }

    if (!adminState.categories.length) {
      select.innerHTML = '<option value="">Create a category first</option>';
      return;
    }

    select.innerHTML = adminState.categories.map(function (category) {
      return '<option value="' + category.id + '">' + escapeHtml(category.name) + "</option>";
    }).join("");

    if (selectedId) {
      select.value = selectedId;
    }
  }

  function renderOverviewCards() {
    var container = document.querySelector("[data-admin-overview]");
    if (!container) {
      return;
    }

    var lowStockProducts = adminState.products.filter(function (product) {
      if (!isProductVisible(product)) {
        return false;
      }
      var stock = getInventoryForProduct(product.id);
      return [stock.M, stock.L, stock.XL].some(function (value) {
        return Number(value) <= 5;
      });
    }).length;

    var cards = [
      {
        title: "Total Products",
        value: String(adminState.products.length),
        note: "Live products connected to the storefront catalog."
      },
      {
        title: "Total Orders",
        value: String(adminState.orders.length),
        note: "All submitted customer orders in Supabase."
      },
      {
        title: "Pending Orders",
        value: String(adminState.orders.filter(function (order) {
          return ["Pending Delivery Charge", "Payment Submitted"].indexOf(order.status) > -1;
        }).length),
        note: "Orders waiting for payment verification or confirmation."
      },
      {
        title: "Confirmed Orders",
        value: String(adminState.orders.filter(function (order) {
          return ["Confirmed", "Processing", "Shipped", "Delivered"].indexOf(order.status) > -1;
        }).length),
        note: "Orders already moved beyond payment review."
      },
      {
        title: "Low Stock Products",
        value: String(lowStockProducts),
        note: "Products with at least one size at 5 or below."
      },
      {
        title: "Revenue Summary",
        value: formatPrice(getConfirmedRevenue()),
        note: "Revenue from confirmed, processing, shipped, and delivered orders."
      }
    ];

    container.innerHTML = cards.map(function (card) {
      return (
        '<article class="admin-overview-card">' +
          "<h3>" + escapeHtml(card.title) + "</h3>" +
          '<div class="admin-overview-value">' + escapeHtml(card.value) + "</div>" +
          '<p class="admin-overview-note">' + escapeHtml(card.note) + "</p>" +
        "</article>"
      );
    }).join("");
  }

  function renderAnalytics() {
    var container = document.querySelector("[data-admin-analytics]");
    if (!container) {
      return;
    }

    var deliveredRevenue = adminState.orders.reduce(function (total, order) {
      return order.status === "Delivered"
        ? total + Number(order.product_total || 0)
        : total;
    }, 0);
    var soldCount = adminState.orders.reduce(function (total, order) {
      if (["Confirmed", "Processing", "Shipped", "Delivered"].indexOf(order.status) === -1) {
        return total;
      }
      return total + getOrderItemsQuantity(order);
    }, 0);
    var bestSelling = getBestSellingProducts();

    container.innerHTML =
      '<article class="admin-analytics-card">' +
        "<h3>Store Performance</h3>" +
        '<div class="admin-kpi-list">' +
          '<div class="admin-kpi-line"><span>Products Sold</span><strong>' + soldCount + "</strong></div>" +
          '<div class="admin-kpi-line"><span>Orders This Month</span><strong>' + getOrdersThisMonth() + "</strong></div>" +
          '<div class="admin-kpi-line"><span>Confirmed Revenue</span><strong>' + formatPrice(getConfirmedRevenue()) + "</strong></div>" +
          '<div class="admin-kpi-line"><span>Delivered Revenue</span><strong>' + formatPrice(deliveredRevenue) + "</strong></div>" +
        "</div>" +
      "</article>" +
      '<article class="admin-analytics-card">' +
        "<h3>Best Selling Products</h3>" +
        (
          bestSelling.length
            ? '<div class="admin-kpi-list">' + bestSelling.map(function (item) {
                return '<div class="admin-kpi-line"><span>' + escapeHtml(item.name) + '</span><strong>' + item.quantity + " sold</strong></div>";
              }).join("") + "</div>"
            : '<p class="admin-empty-note">Best sellers will appear after confirmed orders start coming in.</p>'
        ) +
      "</article>";
  }

  function renderInventoryTable() {
    var tbody = document.querySelector("[data-admin-inventory-table]");
    if (!tbody) {
      return;
    }

    if (!adminState.products.length) {
      tbody.innerHTML = "";
      return;
    }

    tbody.innerHTML = adminState.products.map(function (product) {
      var stock = getInventoryForProduct(product.id);
      return (
        "<tr>" +
          "<td><strong>" + escapeHtml(product.name) + "</strong></td>" +
          "<td>" + createStockCell(product.id, "M", stock.M) + "</td>" +
          "<td>" + createStockCell(product.id, "L", stock.L) + "</td>" +
          "<td>" + createStockCell(product.id, "XL", stock.XL) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function renderCategoryList() {
    var container = document.querySelector("[data-admin-category-list]");
    if (!container) {
      return;
    }

    if (!adminState.categories.length) {
      container.innerHTML =
        '<div class="admin-order-empty"><strong>No categories yet.</strong><p>Create your first category to group future products automatically.</p></div>';
      return;
    }

    container.innerHTML = adminState.categories.map(function (category) {
      var productCount = adminState.products.filter(function (product) {
        return product.category_id === category.id;
      }).length;

      return (
        '<article class="admin-simple-card">' +
          '<div class="admin-product-head">' +
            "<div><strong>" + escapeHtml(category.name) + "</strong><p>" + escapeHtml(category.slug) + "</p></div>" +
            '<span class="admin-status-pill' + (category.is_active ? "" : " is-inactive") + '">' + (category.is_active ? "Active" : "Inactive") + "</span>" +
          "</div>" +
          "<p>" + escapeHtml(category.description || "No description yet.") + "</p>" +
          '<div class="admin-kpi-line"><span>Products in this category</span><strong>' + productCount + "</strong></div>" +
          '<div class="button-row"><button class="button button-light" type="button" data-edit-category="' + category.id + '">Edit</button><button class="button button-dark" type="button" data-delete-category="' + category.id + '">Delete</button></div>' +
        "</article>"
      );
    }).join("");

    bindCategoryActions();
  }

  function getProductStatusClass(status) {
    if (status === "inactive") {
      return " is-inactive";
    }
    if (status === "archived") {
      return " is-archived";
    }
    return "";
  }

  function renderProductList() {
    var container = document.querySelector("[data-admin-product-list]");
    if (!container) {
      return;
    }

    if (!adminState.products.length) {
      container.innerHTML =
        '<div class="admin-order-empty"><strong>No products in Supabase yet.</strong><p>Add a product from the form above to build your live catalog.</p></div>';
      return;
    }

    container.innerHTML = adminState.products.map(function (product) {
      var stock = getInventoryForProduct(product.id);
      var highlightList = Array.isArray(product.product_highlights)
        ? product.product_highlights
        : [];
      var primaryImage = getPrimaryImage(product);
      return (
        '<article class="admin-product-card">' +
          '<div class="admin-product-preview">' +
            '<img src="' + escapeHtml(primaryImage ? primaryImage.image_url : "images/product-1.svg") + '" alt="' + escapeHtml(product.name) + '">' +
            '<div class="admin-product-copy">' +
              '<div class="admin-product-head">' +
                "<div><strong>" + escapeHtml(product.name) + "</strong><p>" + escapeHtml(getCategoryName(product)) + " / " + formatPrice(product.price) + "</p></div>" +
                '<span class="admin-status-pill' + getProductStatusClass(product.status) + '">' + escapeHtml(product.status || "active") + "</span>" +
              "</div>" +
              '<div class="admin-product-meta"><p><strong>Slug:</strong> ' + escapeHtml(product.slug || "") + "</p><p><strong>Color:</strong> " + escapeHtml(product.color || "") + "</p><p><strong>Material:</strong> " + escapeHtml(product.material || "") + "</p></div>" +
              '<div class="admin-product-stock-row"><p><strong>M:</strong> ' + stock.M + "</p><p><strong>L:</strong> " + stock.L + "</p><p><strong>XL:</strong> " + stock.XL + "</p></div>" +
              "<p>" + escapeHtml(product.short_description || product.description || "") + "</p>" +
              (
                highlightList.length
                  ? '<ul class="admin-highlight-list">' + highlightList.map(function (line) {
                      return "<li>" + escapeHtml(line) + "</li>";
                    }).join("") + "</ul>"
                  : ""
              ) +
            "</div>" +
          "</div>" +
          '<div class="button-row"><button class="button button-light" type="button" data-edit-product="' + product.id + '">Edit</button><button class="button button-light" type="button" data-toggle-status="' + product.id + '">' + (product.status === "active" ? "Archive" : "Activate") + '</button><button class="button button-dark" type="button" data-delete-product="' + product.id + '">Delete</button></div>' +
        "</article>"
      );
    }).join("");

    bindProductActions();
  }

  function getFilteredOrders() {
    var searchField = document.querySelector("[data-order-search]");
    var statusField = document.querySelector("[data-order-filter-status]");
    var searchText = searchField ? searchField.value.trim().toLowerCase() : "";
    var status = statusField ? statusField.value : "All";

    return adminState.orders.filter(function (order) {
      var matchesStatus = status === "All" || order.status === status;
      var orderText = [
        order.order_number,
        order.customer_name,
        order.phone
      ].join(" ").toLowerCase();
      var matchesSearch = !searchText || orderText.indexOf(searchText) > -1;
      return matchesStatus && matchesSearch;
    });
  }

  function renderOrders() {
    var container = document.querySelector("[data-admin-orders]");
    if (!container) {
      return;
    }

    var orders = getFilteredOrders();
    if (!orders.length) {
      container.innerHTML =
        '<div class="admin-order-empty"><strong>No matching orders found.</strong><p>Try adjusting the current search or status filter.</p></div>';
      return;
    }

    container.innerHTML = orders.map(function (order) {
      var paymentDetails = order.payments.length
        ? order.payments.map(function (payment) {
            return (
              '<div class="admin-order-summary"><p><strong>Payment Method:</strong> ' + escapeHtml(payment.payment_method) + "</p><p><strong>Transaction ID:</strong> " + escapeHtml(payment.transaction_id) + "</p><p><strong>Payment Status:</strong> " + escapeHtml(payment.status) + "</p></div>"
            );
          }).join("")
        : '<p class="admin-empty-note">No delivery charge payment submitted yet.</p>';

      return (
        '<article class="admin-order-card">' +
          '<div class="track-card-head"><div><strong>' + escapeHtml(order.order_number) + "</strong><p>" + escapeHtml(new Date(order.created_at).toLocaleString()) + '</p></div><span class="status-pill">' + escapeHtml(order.status) + "</span></div>" +
          '<div class="admin-order-meta"><p><strong>Name:</strong> ' + escapeHtml(order.customer_name) + "</p><p><strong>Phone:</strong> " + escapeHtml(order.phone) + "</p></div>" +
          '<div class="admin-order-meta"><p><strong>Address:</strong> ' + escapeHtml(order.address) + "</p><p><strong>Division:</strong> " + escapeHtml(order.division) + "</p></div>" +
          '<div class="admin-order-meta"><p><strong>Delivery Location:</strong> ' + escapeHtml(order.delivery_location) + "</p><p><strong>Items:</strong> " + getOrderItemsQuantity(order) + "</p></div>" +
          '<div class="admin-order-summary"><p><strong>Product Total:</strong> ' + formatPrice(order.product_total) + "</p><p><strong>Delivery Charge:</strong> " + formatPrice(order.delivery_charge) + '</p><p><strong>Pay Now:</strong> ' + formatPrice(order.amount_to_pay_now) + '</p><p><strong>Pay on Delivery:</strong> ' + formatPrice(order.amount_to_pay_on_delivery) + "</p></div>" +
          paymentDetails +
          '<div class="admin-order-lines">' +
            order.items.map(function (item) {
              return '<div class="admin-order-line">' + escapeHtml(item.product_name) + " / Size " + escapeHtml(item.size) + " / Qty " + escapeHtml(item.quantity) + "</div>";
            }).join("") +
          "</div>" +
          '<div class="admin-order-actions"><select class="admin-order-status" data-order-status="' + order.id + '">' +
            orderStatusOptions.map(function (status) {
              return '<option value="' + status + '"' + (order.status === status ? " selected" : "") + ">" + status + "</option>";
            }).join("") +
          '</select><button class="button button-dark" type="button" data-save-order-status="' + order.id + '">Update Status</button></div>' +
        "</article>"
      );
    }).join("");

    bindOrderStatusHandlers();
  }

  function renderPayments() {
    var container = document.querySelector("[data-admin-payments]");
    if (!container) {
      return;
    }

    if (!adminState.payments.length) {
      container.innerHTML =
        '<div class="admin-order-empty"><strong>No payment submissions yet.</strong><p>Delivery charge payment records will appear here after customers submit them.</p></div>';
      return;
    }

    container.innerHTML = adminState.payments.map(function (payment) {
      var order = adminState.orders.find(function (entry) {
        return entry.id === payment.order_id;
      });

      return (
        '<article class="admin-order-card admin-payment-card">' +
          '<div class="track-card-head"><div><strong>' + escapeHtml(order ? order.order_number : "Unknown Order") + "</strong><p>" + escapeHtml(new Date(payment.created_at).toLocaleString()) + '</p></div><span class="status-pill">' + escapeHtml(payment.status) + "</span></div>" +
          "<p><strong>Payment Method:</strong> " + escapeHtml(payment.payment_method) + "</p>" +
          "<p><strong>Transaction ID:</strong> " + escapeHtml(payment.transaction_id) + "</p>" +
          "<p><strong>Amount:</strong> " + formatPrice(payment.amount) + "</p>" +
          (
            order
              ? "<p><strong>Customer:</strong> " + escapeHtml(order.customer_name) + " / " + escapeHtml(order.phone) + "</p>"
              : ""
          ) +
          '<div class="admin-order-actions"><select class="admin-order-status" data-payment-status="' + payment.id + '">' +
            paymentStatusOptions.map(function (status) {
              return '<option value="' + status + '"' + (payment.status === status ? " selected" : "") + ">" + status + "</option>";
            }).join("") +
          '</select><button class="button button-dark" type="button" data-save-payment-status="' + payment.id + '">Update Payment</button></div>' +
        "</article>"
      );
    }).join("");

    bindPaymentStatusHandlers();
  }

  function renderImagePreview(imageUrl) {
    var preview = document.querySelector("[data-admin-image-preview]");
    if (!preview) {
      return;
    }

    if (!imageUrl) {
      preview.innerHTML = "<span>No image selected yet.</span>";
      return;
    }

    preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '" alt="Product preview">';
  }

  function resetCategoryForm(category) {
    var form = document.querySelector("[data-admin-category-form]");
    if (!form) {
      return;
    }

    form.reset();
    setError("[data-admin-category-error]", "");

    document.querySelector("[data-category-id]").value = category ? category.id : "";
    document.querySelector('[data-category-field="name"]').value = category ? category.name : "";
    document.querySelector('[data-category-field="slug"]').value = category ? category.slug : "";
    document.querySelector('[data-category-field="description"]').value = category ? category.description : "";
    document.querySelector('[data-category-field="active"]').value = category && category.is_active === false ? "false" : "true";
  }

  function resetProductForm(product) {
    var form = document.querySelector("[data-admin-product-form]");
    if (!form) {
      return;
    }

    form.reset();
    setError("[data-admin-product-error]", "");
    setError("[data-admin-image-error]", "");
    document.querySelector("[data-product-id]").value = product ? product.id : "";
    document.querySelector('[data-product-field="name"]').value = product ? product.name : "";
    document.querySelector('[data-product-field="slug"]').value = product ? product.slug : "";
    document.querySelector('[data-product-field="color"]').value = product ? product.color : "";
    document.querySelector('[data-product-field="material"]').value = product ? product.material : "100% Cotton";
    document.querySelector('[data-product-field="price"]').value = product ? Number(product.price) : "";
    document.querySelector('[data-product-field="shortDescription"]').value = product ? product.short_description : "";
    document.querySelector('[data-product-field="description"]').value = product ? product.description : "";
    var primaryImage = product ? getPrimaryImage(product) : null;
    document.querySelector('[data-product-field="image"]').value = primaryImage ? primaryImage.image_url : "";
    document.querySelector('[data-product-field="image"]').dataset.imagePath = primaryImage ? (primaryImage.storage_path || "") : "";
    document.querySelector('[data-product-field="status"]').value = product ? (product.status || "active") : "active";
    document.querySelector('[data-product-field="seoTitle"]').value = product ? (product.seo_title || "") : "";
    document.querySelector('[data-product-field="seoDescription"]').value = product ? (product.seo_description || "") : "";
    document.querySelector('[data-product-field="highlights"]').value = product && Array.isArray(product.product_highlights)
      ? product.product_highlights.join("\n")
      : "";
    document.querySelector('[data-product-stock="M"]').value = product ? getInventoryForProduct(product.id).M : 0;
    document.querySelector('[data-product-stock="L"]').value = product ? getInventoryForProduct(product.id).L : 0;
    document.querySelector('[data-product-stock="XL"]').value = product ? getInventoryForProduct(product.id).XL : 0;
    populateCategoryOptions(product ? product.category_id : "");
    renderImagePreview(primaryImage ? primaryImage.image_url : "");
  }

  function getCategoryFormData() {
    var name = document.querySelector('[data-category-field="name"]').value.trim();
    var slugField = document.querySelector('[data-category-field="slug"]');
    var slug = slugify(slugField.value || name);
    var description = document.querySelector('[data-category-field="description"]').value.trim();
    var active = document.querySelector('[data-category-field="active"]').value === "true";
    var id = document.querySelector("[data-category-id]").value;

    if (!name) {
      return null;
    }

    slugField.value = slug;

    return {
      id: id || null,
      name: name,
      slug: slug,
      description: description,
      is_active: active
    };
  }

  function getProductFormData() {
    var nameField = document.querySelector('[data-product-field="name"]');
    var slugField = document.querySelector('[data-product-field="slug"]');
    var categoryId = document.querySelector('[data-product-field="categoryId"]').value;
    var category = getCategoryById(categoryId);
    var color = document.querySelector('[data-product-field="color"]').value.trim();
    var material = document.querySelector('[data-product-field="material"]').value.trim();
    var price = Number(document.querySelector('[data-product-field="price"]').value);
    var shortDescription = document.querySelector('[data-product-field="shortDescription"]').value.trim();
    var description = document.querySelector('[data-product-field="description"]').value.trim();
    var image = document.querySelector('[data-product-field="image"]').value.trim();
    var imagePath = document.querySelector('[data-product-field="image"]').dataset.imagePath || "";
    var status = document.querySelector('[data-product-field="status"]').value;
    var seoTitle = document.querySelector('[data-product-field="seoTitle"]').value.trim();
    var seoDescription = document.querySelector('[data-product-field="seoDescription"]').value.trim();
    var highlights = document.querySelector('[data-product-field="highlights"]').value
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
    var productId = document.querySelector("[data-product-id]").value;
    var slug = slugify(slugField.value || nameField.value);
    var stock = {
      M: Math.max(0, Number(document.querySelector('[data-product-stock="M"]').value) || 0),
      L: Math.max(0, Number(document.querySelector('[data-product-stock="L"]').value) || 0),
      XL: Math.max(0, Number(document.querySelector('[data-product-stock="XL"]').value) || 0)
    };

    slugField.value = slug;

    if (!nameField.value.trim() || !category || !color || !material || !image || !description || !price) {
      return null;
    }

    return {
      id: productId || null,
      category_id: category.id,
      name: nameField.value.trim(),
      slug: slug,
      color: color,
      material: material,
      price: price,
      image_url: image,
      image_path: imagePath || null,
      short_description: shortDescription || description.slice(0, 140),
      description: description,
      product_highlights: highlights,
      seo_title: seoTitle || nameField.value.trim() + " | Aurox",
      seo_description: seoDescription || shortDescription || description.slice(0, 160),
      status: status,
      is_active: status === "active",
      stock: stock
    };
  }

  async function saveCategory(categoryData) {
    var response = categoryData.id
      ? await supabase
          .from("categories")
          .update({
            name: categoryData.name,
            slug: categoryData.slug,
            description: categoryData.description,
            is_active: categoryData.is_active
          })
          .eq("id", categoryData.id)
      : await supabase
          .from("categories")
          .insert({
            name: categoryData.name,
            slug: categoryData.slug,
            description: categoryData.description,
            is_active: categoryData.is_active
          });

    if (response.error) {
      throw response.error;
    }
  }

  async function saveProduct(productData) {
    var productPayload = {
      category_id: productData.category_id,
      name: productData.name,
      slug: productData.slug,
      color: productData.color,
      material: productData.material,
      price: productData.price,
      short_description: productData.short_description,
      description: productData.description,
      product_highlights: productData.product_highlights,
      seo_title: productData.seo_title,
      seo_description: productData.seo_description,
      status: productData.status,
      is_active: productData.is_active
    };

    var response = productData.id
      ? await supabase
          .from("products")
          .update(productPayload)
          .eq("id", productData.id)
          .select("id")
          .single()
      : await supabase
          .from("products")
          .insert(productPayload)
          .select("id")
          .single();

    if (response.error || !response.data) {
      throw response.error || new Error("Could not save product.");
    }

    var imageDeleteResponse = await supabase
      .from("product_images")
      .delete()
      .eq("product_id", response.data.id);

    if (imageDeleteResponse.error) {
      throw imageDeleteResponse.error;
    }

    if (productData.image_url) {
      var imageInsertResponse = await supabase
        .from("product_images")
        .insert({
          product_id: response.data.id,
          image_url: productData.image_url,
          is_primary: true,
          storage_path: productData.image_path
        });

      if (imageInsertResponse.error) {
        throw imageInsertResponse.error;
      }
    }

    var inventoryRows = ["M", "L", "XL"].map(function (size) {
      return {
        product_id: response.data.id,
        size: size,
        stock_quantity: productData.stock[size]
      };
    });

    var inventoryResponse = await supabase
      .from("inventory")
      .upsert(inventoryRows, { onConflict: "product_id,size" });

    if (inventoryResponse.error) {
      throw inventoryResponse.error;
    }
  }

  async function saveInventoryTable() {
    var rows = [];
    document.querySelectorAll("[data-stock-input]").forEach(function (input) {
      rows.push({
        product_id: input.getAttribute("data-stock-input"),
        size: input.getAttribute("data-size"),
        stock_quantity: Math.max(0, Number(input.value) || 0)
      });
    });

    var response = await supabase
      .from("inventory")
      .upsert(rows, { onConflict: "product_id,size" });

    if (response.error) {
      throw response.error;
    }
  }

  async function saveShippingSettings() {
    var payload = [
      {
        location_name: "Sylhet",
        charge: Math.max(0, Number(document.querySelector('[data-shipping-input="Sylhet"]').value) || 0)
      },
      {
        location_name: "Outside Sylhet",
        charge: Math.max(0, Number(document.querySelector('[data-shipping-input="Outside Sylhet"]').value) || 0)
      }
    ];

    var response = await supabase
      .from("shipping_settings")
      .upsert(payload, { onConflict: "location_name" });

    if (response.error) {
      throw response.error;
    }
  }

  async function resetShippingSettings() {
    var payload = [
      { location_name: "Sylhet", charge: defaultShipping.Sylhet },
      { location_name: "Outside Sylhet", charge: defaultShipping["Outside Sylhet"] }
    ];

    var response = await supabase
      .from("shipping_settings")
      .upsert(payload, { onConflict: "location_name" });

    if (response.error) {
      throw response.error;
    }
  }

  async function deleteCategory(categoryId) {
    var linkedProductCount = adminState.products.filter(function (product) {
      return product.category_id === categoryId;
    }).length;

    if (linkedProductCount) {
      throw new Error("Move products out of this category before deleting it.");
    }

    var response = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryId);

    if (response.error) {
      throw response.error;
    }
  }

  function extractStoragePathFromUrl(imageUrl) {
    if (!imageUrl) {
      return "";
    }

    var marker = "/object/public/" + SUPABASE_STORAGE_BUCKET + "/";
    var index = imageUrl.indexOf(marker);
    return index > -1 ? decodeURIComponent(imageUrl.slice(index + marker.length)) : "";
  }

  async function deleteProductImage(product) {
    if (!product) {
      return;
    }

    var primaryImage = getPrimaryImage(product);
    var imagePath = primaryImage
      ? (primaryImage.storage_path || extractStoragePathFromUrl(primaryImage.image_url))
      : "";
    if (imagePath) {
      await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([imagePath]);
    }
    if (primaryImage) {
      var deleteResponse = await supabase
        .from("product_images")
        .delete()
        .eq("id", primaryImage.id);

      if (deleteResponse.error) {
        throw deleteResponse.error;
      }
    }
  }

  async function deleteProduct(productId) {
    var product = adminState.products.find(function (item) {
      return item.id === productId;
    });

    if (product) {
      var primaryImage = getPrimaryImage(product);
      var imagePath = primaryImage
        ? (primaryImage.storage_path || extractStoragePathFromUrl(primaryImage.image_url))
        : "";
      if (imagePath) {
        await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([imagePath]);
      }
    }

    var response = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (response.error) {
      throw response.error;
    }
  }

  async function updateProductStatus(productId, nextStatus) {
    var response = await supabase
      .from("products")
      .update({
        status: nextStatus,
        is_active: nextStatus === "active"
      })
      .eq("id", productId);

    if (response.error) {
      throw response.error;
    }
  }

  async function uploadProductImage() {
    var fileInput = document.querySelector("[data-product-image-upload]");
    var errorSelector = "[data-admin-image-error]";

    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      throw new Error("Choose an image before uploading.");
    }

    var productName = document.querySelector('[data-product-field="name"]').value.trim() || "aurox-product";
    var file = fileInput.files[0];
    var safeName = slugify(productName) || "aurox-product";
    var extension = file.name.indexOf(".") > -1
      ? file.name.split(".").pop().toLowerCase()
      : "png";
    var filePath = "products/" + safeName + "-" + Date.now() + "." + extension;

    var uploadResponse = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadResponse.error) {
      setError(errorSelector, uploadResponse.error.message);
      throw uploadResponse.error;
    }

    var publicUrlResponse = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    var imageUrl = publicUrlResponse.data ? publicUrlResponse.data.publicUrl : "";
    document.querySelector('[data-product-field="image"]').value = imageUrl;
    document.querySelector('[data-product-field="image"]').dataset.imagePath = filePath;
    renderImagePreview(imageUrl);
    setError(errorSelector, "");

    return {
      image_url: imageUrl,
      image_path: filePath
    };
  }

  async function persistProductImagePath(productId, imagePath, imageUrl) {
    if (!productId || !imageUrl) {
      return;
    }

    var deleteResponse = await supabase
      .from("product_images")
      .delete()
      .eq("product_id", productId);

    if (deleteResponse.error) {
      throw deleteResponse.error;
    }

    var insertResponse = await supabase
      .from("product_images")
      .insert({
        product_id: productId,
        image_url: imageUrl,
        is_primary: true,
        storage_path: imagePath || null
      });

    if (insertResponse.error) {
      throw insertResponse.error;
    }
  }

  async function canApplyStock(order) {
    for (var index = 0; index < order.items.length; index += 1) {
      var item = order.items[index];
      var stockResponse = await supabase
        .from("inventory")
        .select("id, stock_quantity")
        .eq("product_id", item.product_id)
        .eq("size", item.size)
        .single();

      if (stockResponse.error || !stockResponse.data) {
        return false;
      }

      if (Number(stockResponse.data.stock_quantity) < Number(item.quantity)) {
        return false;
      }
    }

    return true;
  }

  async function applyOrderStock(order, direction) {
    for (var index = 0; index < order.items.length; index += 1) {
      var item = order.items[index];
      var stockResponse = await supabase
        .from("inventory")
        .select("id, stock_quantity")
        .eq("product_id", item.product_id)
        .eq("size", item.size)
        .single();

      if (stockResponse.error || !stockResponse.data) {
        throw stockResponse.error || new Error("Inventory row not found.");
      }

      var nextQuantity = Math.max(
        0,
        Number(stockResponse.data.stock_quantity) + direction * Number(item.quantity)
      );

      var updateResponse = await supabase
        .from("inventory")
        .update({ stock_quantity: nextQuantity })
        .eq("id", stockResponse.data.id);

      if (updateResponse.error) {
        throw updateResponse.error;
      }
    }
  }

  async function updateOrderStatus(orderId, nextStatus) {
    var order = adminState.orders.find(function (entry) {
      return entry.id === orderId;
    });

    if (!order) {
      throw new Error("Order not found.");
    }

    if (nextStatus === "Confirmed" && order.status !== "Confirmed") {
      var enoughStock = await canApplyStock(order);
      if (!enoughStock) {
        throw new Error("Not enough stock to confirm this order.");
      }
      await applyOrderStock(order, -1);
    }

    if (
      order.status === "Confirmed" &&
      ["Cancelled", "Pending Delivery Charge", "Payment Submitted"].indexOf(nextStatus) > -1
    ) {
      await applyOrderStock(order, 1);
    }

    var response = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId);

    if (response.error) {
      throw response.error;
    }
  }

  async function updatePaymentStatus(paymentId, nextStatus) {
    var payment = adminState.payments.find(function (entry) {
      return entry.id === paymentId;
    });

    if (!payment) {
      throw new Error("Payment record not found.");
    }

    var response = await supabase
      .from("payments")
      .update({ status: nextStatus })
      .eq("id", paymentId);

    if (response.error) {
      throw response.error;
    }

    if (nextStatus === "Verified") {
      var order = adminState.orders.find(function (entry) {
        return entry.id === payment.order_id;
      });
      if (order && order.status === "Payment Submitted") {
        await updateOrderStatus(order.id, "Confirmed");
      }
    }
  }

  function bindCategoryActions() {
    document.querySelectorAll("[data-edit-category]").forEach(function (button) {
      button.addEventListener("click", function () {
        var category = adminState.categories.find(function (entry) {
          return entry.id === button.getAttribute("data-edit-category");
        });
        resetCategoryForm(category);
      });
    });

    document.querySelectorAll("[data-delete-category]").forEach(function (button) {
      button.addEventListener("click", async function () {
        try {
          await deleteCategory(button.getAttribute("data-delete-category"));
          await renderDashboard();
          resetCategoryForm();
          showSuccess("[data-admin-category-success]", "Category deleted successfully.");
        } catch (error) {
          setError("[data-admin-category-error]", error && error.message ? error.message : "Could not delete category.");
        }
      });
    });
  }

  function bindProductActions() {
    document.querySelectorAll("[data-edit-product]").forEach(function (button) {
      button.addEventListener("click", function () {
        var product = adminState.products.find(function (entry) {
          return entry.id === button.getAttribute("data-edit-product");
        });
        resetProductForm(product);
      });
    });

    document.querySelectorAll("[data-toggle-status]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var product = adminState.products.find(function (entry) {
          return entry.id === button.getAttribute("data-toggle-status");
        });
        if (!product) {
          return;
        }

        try {
          await updateProductStatus(product.id, product.status === "active" ? "archived" : "active");
          await renderDashboard();
          showSuccess("[data-admin-product-success]", "Product status updated successfully.");
        } catch (error) {
          setError("[data-admin-product-error]", error && error.message ? error.message : "Could not update product status.");
        }
      });
    });

    document.querySelectorAll("[data-delete-product]").forEach(function (button) {
      button.addEventListener("click", async function () {
        try {
          await deleteProduct(button.getAttribute("data-delete-product"));
          await renderDashboard();
          resetProductForm();
          showSuccess("[data-admin-product-success]", "Product deleted successfully.");
        } catch (error) {
          setError("[data-admin-product-error]", error && error.message ? error.message : "Could not delete product.");
        }
      });
    });
  }

  function bindOrderStatusHandlers() {
    document.querySelectorAll("[data-save-order-status]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var orderId = button.getAttribute("data-save-order-status");
        var select = document.querySelector('[data-order-status="' + orderId + '"]');

        try {
          await updateOrderStatus(orderId, select.value);
          await renderDashboard();
          showSuccess("[data-admin-order-success]", "Order updated successfully.");
        } catch (error) {
          await renderDashboard();
          showSuccess("[data-admin-order-success]", error && error.message ? error.message : "Could not update order.");
        }
      });
    });
  }

  function bindPaymentStatusHandlers() {
    document.querySelectorAll("[data-save-payment-status]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var paymentId = button.getAttribute("data-save-payment-status");
        var select = document.querySelector('[data-payment-status="' + paymentId + '"]');

        try {
          await updatePaymentStatus(paymentId, select.value);
          await renderDashboard();
          showSuccess("[data-admin-payment-success]", "Payment updated successfully.");
        } catch (error) {
          await renderDashboard();
          showSuccess("[data-admin-payment-success]", error && error.message ? error.message : "Could not update payment.");
        }
      });
    });
  }

  async function renderDashboard() {
    await refreshAdminData();
    populateCategoryOptions();
    renderOverviewCards();
    renderAnalytics();
    renderCategoryList();
    renderInventoryTable();
    renderProductList();
    renderOrders();
    renderPayments();
  }

  function renderAdminAccess(isLoggedIn) {
    var loginScreen = document.querySelector("[data-admin-login-screen]");
    var dashboard = document.querySelector("[data-admin-dashboard]");
    if (!loginScreen || !dashboard) {
      return;
    }

    loginScreen.hidden = isLoggedIn;
    dashboard.hidden = !isLoggedIn;
  }

  async function initAdminAuth() {
    var loginForm = document.querySelector("[data-admin-login-form]");
    var emailField = document.querySelector("[data-admin-email]");
    var passwordField = document.querySelector("[data-admin-password]");
    var logoutButton = document.querySelector("[data-admin-logout]");

    if (!supabaseReady || !supabase) {
      setError("[data-admin-login-error]", "Configure js/supabase-config.js with your Supabase URL and anon key first.");
      renderAdminAccess(false);
      return;
    }

    var sessionResponse = await supabase.auth.getSession();
    renderAdminAccess(Boolean(sessionResponse.data.session));

    if (sessionResponse.data.session) {
      await renderDashboard();
    }

    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      var loginResponse = await supabase.auth.signInWithPassword({
        email: emailField.value.trim(),
        password: passwordField.value
      });

      if (loginResponse.error) {
        setError("[data-admin-login-error]", loginResponse.error.message);
        return;
      }

      setError("[data-admin-login-error]", "");
      passwordField.value = "";
      renderAdminAccess(true);
      await renderDashboard();
    });

    logoutButton.addEventListener("click", async function () {
      await supabase.auth.signOut();
      renderAdminAccess(false);
      passwordField.value = "";
    });

    supabase.auth.onAuthStateChange(async function (event, session) {
      renderAdminAccess(Boolean(session));
      if (session) {
        await renderDashboard();
      }
    });
  }

  function initProductHelpers() {
    var nameField = document.querySelector('[data-product-field="name"]');
    var slugField = document.querySelector('[data-product-field="slug"]');
    var categoryField = document.querySelector('[data-product-field="categoryId"]');
    var imageUrlField = document.querySelector('[data-product-field="image"]');

    if (nameField && slugField) {
      nameField.addEventListener("input", function () {
        if (!slugField.dataset.touched) {
          slugField.value = slugify(nameField.value);
        }
      });

      slugField.addEventListener("input", function () {
        slugField.dataset.touched = "true";
      });
    }

    if (imageUrlField) {
      imageUrlField.addEventListener("input", function () {
        imageUrlField.dataset.imagePath = "";
        renderImagePreview(imageUrlField.value.trim());
      });
    }

    document.querySelector("[data-generate-copy]").addEventListener("click", function () {
      var category = getCategoryById(categoryField.value);
      var aiCopy = generateAiCopy({
        name: nameField.value.trim(),
        material: document.querySelector('[data-product-field="material"]').value.trim(),
        categoryName: category ? category.name : "Aurox essential"
      });

      document.querySelector('[data-product-field="shortDescription"]').value = aiCopy.shortDescription;
      document.querySelector('[data-product-field="description"]').value = aiCopy.description;
      document.querySelector('[data-product-field="highlights"]').value = aiCopy.highlights.join("\n");
      document.querySelector('[data-product-field="seoTitle"]').value = aiCopy.seoTitle;
      document.querySelector('[data-product-field="seoDescription"]').value = aiCopy.seoDescription;
    });
  }

  function bindAdminFilters() {
    var searchField = document.querySelector("[data-order-search]");
    var statusField = document.querySelector("[data-order-filter-status]");

    if (searchField) {
      searchField.addEventListener("input", renderOrders);
    }
    if (statusField) {
      statusField.addEventListener("change", renderOrders);
    }
  }

  function initAdminActions() {
    document.querySelector("[data-admin-category-form]").addEventListener("submit", async function (event) {
      event.preventDefault();
      setError("[data-admin-category-error]", "");
      var categoryData = getCategoryFormData();

      if (!categoryData) {
        setError("[data-admin-category-error]", "Complete the category name before saving.");
        return;
      }

      try {
        await saveCategory(categoryData);
        await renderDashboard();
        resetCategoryForm();
        showSuccess("[data-admin-category-success]", categoryData.id ? "Category updated successfully." : "Category added successfully.");
      } catch (error) {
        setError("[data-admin-category-error]", error && error.message ? error.message : "Could not save category.");
      }
    });

    document.querySelector("[data-category-reset]").addEventListener("click", function () {
      resetCategoryForm();
    });

    document.querySelector("[data-admin-product-form]").addEventListener("submit", async function (event) {
      event.preventDefault();
      setError("[data-admin-product-error]", "");
      var productData = getProductFormData();

      if (!productData) {
        setError("[data-admin-product-error]", "Complete all product fields before saving.");
        return;
      }

      try {
        await saveProduct(productData);
        await renderDashboard();
        resetProductForm();
        showSuccess("[data-admin-product-success]", productData.id ? "Product updated successfully." : "Product added successfully.");
      } catch (error) {
        setError("[data-admin-product-error]", error && error.message ? error.message : "Could not save product.");
      }
    });

    document.querySelector("[data-product-reset]").addEventListener("click", function () {
      resetProductForm();
    });

    document.querySelector("[data-save-inventory]").addEventListener("click", async function () {
      try {
        await saveInventoryTable();
        await renderDashboard();
        showSuccess("[data-admin-success]", "Inventory saved successfully.");
      } catch (error) {
        showSuccess("[data-admin-success]", error && error.message ? error.message : "Could not save inventory.");
      }
    });

    document.querySelector("[data-save-shipping]").addEventListener("click", async function () {
      try {
        await saveShippingSettings();
        await fetchShippingSettings();
        showSuccess("[data-admin-shipping-success]", "Shipping settings saved successfully.");
      } catch (error) {
        showSuccess("[data-admin-shipping-success]", error && error.message ? error.message : "Could not save shipping settings.");
      }
    });

    document.querySelector("[data-reset-shipping]").addEventListener("click", async function () {
      try {
        await resetShippingSettings();
        await fetchShippingSettings();
        showSuccess("[data-admin-shipping-success]", "Shipping charges reset to default values.");
      } catch (error) {
        showSuccess("[data-admin-shipping-success]", error && error.message ? error.message : "Could not reset shipping settings.");
      }
    });

    document.querySelector("[data-upload-image]").addEventListener("click", async function () {
      try {
        var uploadData = await uploadProductImage();
        var productId = document.querySelector("[data-product-id]").value;
        if (productId) {
          await persistProductImagePath(productId, uploadData.image_path, uploadData.image_url);
          await renderDashboard();
          var savedProduct = adminState.products.find(function (entry) {
            return entry.id === productId;
          });
          resetProductForm(savedProduct);
        }
        showSuccess("[data-admin-product-success]", "Image uploaded successfully.");
      } catch (error) {
        setError("[data-admin-image-error]", error && error.message ? error.message : "Could not upload image.");
      }
    });

    document.querySelector("[data-remove-image]").addEventListener("click", async function () {
      var productId = document.querySelector("[data-product-id]").value;

      if (!productId) {
        document.querySelector('[data-product-field="image"]').value = "";
        document.querySelector('[data-product-field="image"]').dataset.imagePath = "";
        renderImagePreview("");
        return;
      }

      try {
        var product = adminState.products.find(function (entry) {
          return entry.id === productId;
        });
        await deleteProductImage(product);
        await renderDashboard();
        resetProductForm();
        showSuccess("[data-admin-product-success]", "Image removed successfully.");
      } catch (error) {
        setError("[data-admin-image-error]", error && error.message ? error.message : "Could not remove image.");
      }
    });
  }

  async function initAdminPage() {
    clearErrors();
    initAdminActions();
    initProductHelpers();
    bindAdminFilters();
    resetCategoryForm();
    resetProductForm();
    await initAdminAuth();
  }

  initAdminPage();
})();
