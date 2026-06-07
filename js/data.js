/*
  Local sample data for the Aurox store.
  This file contains:
  1. The product catalog
  2. The default stock values used by the storefront and admin page
  3. The default delivery charges used by checkout and admin settings

  To change the default fallback products later, edit the values inside AUROX_PRODUCTS.
  These are used when no custom products have been saved from the admin dashboard yet.
  To change the default stock later, edit the values inside AUROX_INVENTORY.
  To change the default delivery charges later, edit AUROX_SHIPPING.
*/

window.AUROX_PRODUCTS = [
  {
    id: "think-outside-the-box-tshirt",
    name: "Think Outside The Box T-Shirt",
    category: "New Drop",
    type: "Unisex T-Shirt",
    price: 450,
    color: "Black",
    material: "100% Cotton",
    sizes: ["M", "L", "XL"],
    image: "images/product-1.svg",
    alt: "Think Outside The Box black unisex t-shirt",
    description: "A bold black cotton tee designed for everyday confidence, featuring the Think Outside The Box graphic from the current Aurox drop.",
    badges: ["New"],
    popularity: 95,
    isNew: true
  },
  {
    id: "adventure-tshirt",
    name: "Adventure T-Shirt",
    category: "Essentials",
    type: "Unisex T-Shirt",
    price: 450,
    color: "White",
    material: "100% Cotton",
    sizes: ["M", "L", "XL"],
    image: "images/product-2.svg",
    alt: "Adventure white unisex t-shirt",
    description: "A clean white cotton tee with the Adventure graphic, made for versatile everyday wear and an easy premium feel.",
    badges: ["Best Seller"],
    popularity: 90,
    isNew: true
  },
  {
    id: "wake-up-dreams-tshirt",
    name: "Wake Up Dreams T-Shirt",
    category: "Unisex T-Shirts",
    type: "Unisex T-Shirt",
    price: 450,
    color: "Black",
    material: "100% Cotton",
    sizes: ["M", "L", "XL"],
    image: "images/product-3.svg",
    alt: "Wake Up Dreams black unisex t-shirt",
    description: "A premium black cotton tee with the Wake Up Dreams statement graphic, built for minimal styling with a strong message.",
    badges: [],
    popularity: 88,
    isNew: false
  },
  {
    id: "think-chess-tshirt",
    name: "Think Chess T-Shirt",
    category: "Unisex T-Shirts",
    type: "Unisex T-Shirt",
    price: 450,
    color: "White",
    material: "100% Cotton",
    sizes: ["M", "L", "XL"],
    image: "images/product-4.svg",
    alt: "Think Chess white unisex t-shirt",
    description: "A white cotton tee featuring the Think Chess graphic, balancing sharp visual identity with premium everyday comfort.",
    badges: [],
    popularity: 81,
    isNew: false
  }
];

window.AUROX_INVENTORY = {
  "think-outside-the-box-tshirt": {
    M: 2,
    L: 2,
    XL: 1
  },
  "adventure-tshirt": {
    M: 2,
    L: 2,
    XL: 1
  },
  "wake-up-dreams-tshirt": {
    M: 2,
    L: 2,
    XL: 1
  },
  "think-chess-tshirt": {
    M: 2,
    L: 2,
    XL: 1
  }
};

window.AUROX_SHIPPING = {
  Sylhet: 70,
  "Outside Sylhet": 120
};
