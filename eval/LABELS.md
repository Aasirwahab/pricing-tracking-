# Eval Labels

Each row asks: **does the candidate refer to exactly the same product as the tracked product?**

Rules:
- **✅ same**: same model and variant (color, storage, size). Regional/packaging suffixes don't matter
  (`A159W-N1DF` = `A159W-N1`, `SRPD55K1` = `SRPD55`). Condition doesn't matter (refurbished is still
  the same product; condition is a separate field in the app).
- **❌ not same**: a different variant (e.g. Midnight Blue vs Black), an accessory, a comparison of two
  products, or a category / "25+ for sale" page.
- **➖ unclear**: the text names the model but omits the deciding variant (e.g. no color for shoes).
  Nobody can decide from the text alone, so these are **excluded from scoring**.

Totals: **41 same, 11 not same, 28 unclear (excluded)** out of 80 pairs.
Labels drafted by Claude, reviewed by a human. To correct one, edit `eval/data/labels.json` and re-run.

## Casio A159W-N1 Vintage Silver Digital Watch

| ID | Label | Candidate (watches) | Shop | Note |
|---|---|---|---|---|
| r0 | ✅ same | CASIO VINTAGE A159W-N1 | casio.com | exact model code |
| r1 | ➖ unclear | A159W / CASIO INDIA | casio.com | A159W without the -N1 variant code |
| r2 | ✅ same | Casio Unisex Vintage Watch A159W-N1 Quartz Digital Silver Black | psbwatches.com | A159W-N1, silver |
| r3 | ✅ same | Casio Unisex Vintage A159W-N1DF Black Digital Dial Silver Stainless Steel Band D339 | amazon.in | -N1DF is a regional packaging suffix |
| r4 | ✅ same | Casio A159W-N1 Silver Stainless Steel Retro Style Digital Watch (Made in Japan) | bigw.com.au | A159W-N1 silver |
| r5 | ➖ unclear | CASIO A159W Full Review, an F91W with Stainless Steel Strap - YouTube | youtube.com | A159W review, variant not stated |
| r6 | ✅ same | CASIO A159W-N1 Made in Japan Classic Digital Watch Stainless Steel Band Japan | ebay.com | A159W-N1 |
| r7 | ❌ not same | 1980s / Casio Watch History | casio.com | brand history page, not a product |
| r8 | ✅ same | Casio A159W-N1D Silver Digital Vintage Watch - YouTube | youtube.com | -N1D suffix, silver |
| r9 | ✅ same | CASIO - Vintage Men Digital Watch A159W-N1 Silver Stainless Steel ... | zalora.com.hk | A159W-N1 silver |

## Seiko 5 Sports SRPD55 Automatic Black Dial Watch

| ID | Label | Candidate (watches) | Shop | Note |
|---|---|---|---|---|
| r0 | ✅ same | SRPD55 / Seiko Watch Corporation | seikowatches.com | exact model code |
| r1 | ❌ not same | Seiko 5 Sports | seikousa.com | whole Seiko 5 Sports collection page |
| r2 | ✅ same | Seiko 5 Sports SRPD55 | dejaun.com | SRPD55 |
| r3 | ✅ same | [SRPD55] They can say whatever they want, this watch is a masterpiece | reddit.com | post about the SRPD55 |
| r4 | ➖ unclear | SEIKO Men's Analogue Automatic Watch 5 Sports | amazon.com | no model code in the name |
| r5 | ✅ same | A Do It All Watch For Just Over $200 - Seiko SRPD55 - YouTube | youtube.com | SRPD55 video |
| r6 | ✅ same | Seiko 5 Sports Black Dial And Unidirectional Rotating Bezel Watch SRPD55 | cliftonjewelersinc.com | SRPD55 black dial |
| r7 | ✅ same | Seiko 5 Sports SRPD55 Automatic Black Dial Men's Watch | ebay.com | SRPD55 black dial |
| r8 | ✅ same | Seiko 5 Sports SRPD55K1 Review - A Perfect Everyday Automatic | youtube.com | SRPD55K1, K1 is a regional suffix |
| r9 | ✅ same | Seiko SRPD55 (SBSA005) Review- The Seiko 5 People Love To Hate | watchcrunch.com | SRPD55 (SBSA005 is its Japanese-market code) |

## Samsung Galaxy A55 5G 128GB Awesome Navy

| ID | Label | Candidate (phones) | Shop | Note |
|---|---|---|---|---|
| r0 | ➖ unclear | Samsung Galaxy A55 5G / Specs, Camera & Battery | samsung.com | model page, no storage or color |
| r1 | ✅ same | Galaxy A55 5G Awesome Navy 128 GB / Samsung Africa | samsung.com | Awesome Navy 128 GB |
| r2 | ✅ same | Galaxy A55 5G 8GB/128GB (Awesome Navy) - Full Features | samsung.com | 8GB/128GB Awesome Navy |
| r3 | ➖ unclear | Samsung Galaxy A55 5G (Awesome Navy) - Late 2024 Unboxing and ... | youtube.com | Awesome Navy, storage not stated |
| r4 | ✅ same | Samsung Galaxy A55 5G (Awesome Navy, 128 GB) | flipkart.com | Awesome Navy, 128 GB |
| r5 | ➖ unclear | Samsung Galaxy A55 5G Smartphone - Amazon.in | amazon.in | no storage or color |
| r6 | ✅ same | Galaxy A55 5G Awesome Navy 128 GB / Samsung Australia | samsung.com | Awesome Navy 128 GB |
| r7 | ➖ unclear | Samsung Galaxy A55 5G Long Term Review / Awesome Navy - YouTube | youtube.com | Awesome Navy, storage not stated |
| r8 | ✅ same | Samsung Galaxy A55 128GB Awesome Navy - Idealo | idealo.de | 128GB Awesome Navy |
| r9 | ✅ same | Samsung Galaxy A55 5G - 128 GB - Awesome Navy (Unlocked) | ebay.com | 128 GB Awesome Navy |

## Apple iPhone 15 128GB Black

| ID | Label | Candidate (phones) | Shop | Note |
|---|---|---|---|---|
| r0 | ✅ same | Apple iPhone 15, 128GB, Black - Unlocked (Renewed) - Amazon.com | amazon.com | 128GB Black; renewed is a condition, not a different product |
| r1 | ✅ same | Refurbished iPhone 15 128GB - Black (Unlocked) - Apple | apple.com | 128GB Black; refurbished |
| r2 | ✅ same | Apple iPhone 15 (128GB) - Black - Target | target.com | 128GB Black |
| r3 | ➖ unclear | iPhone 15 • Unlocked Refurbished - Back Market | backmarket.com | no storage or color |
| r4 | ❌ not same | 25+ Apple iPhone 15 for sale / Updated Oct 2026 - eBay | ebay.com | listing of 25+ items |
| r5 | ✅ same | Apple - Refurbished Excellent - iPhone 15 128GB (Unlocked) - Black | bestbuy.com | 128GB Black; refurbished |
| r6 | ➖ unclear | iPhone 15 Unboxing and First Impressions! (Black) - YouTube | youtube.com | Black, storage not stated |
| r7 | ➖ unclear | Apple - iPhone 15 / T-Mobile for Business | t-mobile.com | no storage or color |
| r8 | ✅ same | iPhone 15 128GB Black - Cellcom | cellcom.com | 128GB Black |
| r9 | ❌ not same | Shop iPhone 15 128GB Cell Phones - Walmart | walmart.com | category page, no color |

## Sony WH-1000XM5 Wireless Noise Canceling Headphones Black

| ID | Label | Candidate (headphones) | Shop | Note |
|---|---|---|---|---|
| r0 | ✅ same | WH-1000XM5 Premium Wireless Noise Cancelling Headphones / Black | electronics.sony.com | XM5 Black |
| r1 | ✅ same | Sony WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black | amazon.com | XM5 Black |
| r2 | ❌ not same | WH-1000XM5 Premium Wireless Noise Cancelling Headphones / Midnight Blue | electronics.sony.com | Midnight Blue, a different color |
| r3 | ➖ unclear | Sony WH-1000XM5 - 3 Years Later Review - YouTube | youtube.com | review, color not stated |
| r4 | ➖ unclear | WH-1000XM5 Specifications / Sony USA | sony.com | spec page, color not stated |
| r5 | ➖ unclear | Sony WH-1000XM5 wireless headphones review - What Hi-Fi? | whathifi.com | review, color not stated |
| r6 | ➖ unclear | Sony - WH-1000XM5 Wireless Noise Cancelling Over-the-Ear Headphones | bestbuy.com | color not stated |
| r7 | ➖ unclear | Sony WH-1000XM5 Two-Years Later Review: Still Worth BUYING? | youtube.com | review, color not stated |
| r8 | ✅ same | Sony WH-1000XM5 Bluetooth Wireless Noise-Canceling Headphones - Black | target.com | XM5 Black |
| r9 | ➖ unclear | Sony WH-1000XM5 review - SoundGuys | soundguys.com | review, color not stated |

## Apple AirPods Pro 2 with MagSafe Charging Case (USB-C)

| ID | Label | Candidate (headphones) | Shop | Note |
|---|---|---|---|---|
| r0 | ✅ same | AirPods Pro 2 with MagSafe Case (USB‑C) - Tech Specs | support.apple.com | AirPods Pro 2 with MagSafe Case (USB-C) |
| r1 | ✅ same | AirPods Pro (2nd Gen) with MagSafe Charging Case (USB-C) White (Renewed) | amazon.co.uk | USB-C; renewed is a condition |
| r2 | ✅ same | Apple Airpods Pro 2nd Generation with MagSafe Charging Case (USB‑C) | dealmonday.co.uk | USB-C |
| r3 | ✅ same | Refurbished AirPods Pro 2 with MagSafe Charging Case (USB‑C) | apple.com | USB-C; refurbished |
| r4 | ✅ same | Apple upgrades AirPods Pro (2nd generation) with USB‐C charging | apple.com | announcement of this exact product |
| r5 | ✅ same | AirPods Pro 2nd generation with MagSafe Charging Case (USB‑C) | youtube.com | USB-C |
| r6 | ❌ not same | MagSafe Charging Case USB-C (AirPods Pro 2nd generation) | support.apple.com | the charging case alone (accessory) |
| r7 | ❌ not same | Airpods Pro 2 vs Airpods Pro 2 with MagSafe Case (USB-C) - Reddit | reddit.com | comparison of two products |
| r8 | ✅ same | Apple AirPods Pro 2nd Generation with MagSafe Charging Case (USB ... | pricerunner.com | USB-C |
| r9 | ✅ same | Apple AirPods Pro (2nd generation) with MagSafe Charging Case (USB‑C) Mid 2023 | ebay.co.uk | USB-C |

## Nike Air Force 1 '07 Men's Shoes White/White

| ID | Label | Candidate (shoes) | Shop | Note |
|---|---|---|---|---|
| r0 | ➖ unclear | Nike Air Force 1 '07 Men's Shoes | nike.com | color not stated |
| r1 | ❌ not same | Mens White Air Force 1 Shoes. Nike.com | nike.com | category page |
| r2 | ➖ unclear | Nike Air Force 1 '07 Men's Shoes | nike.com | color not stated |
| r3 | ➖ unclear | Nike Air Force 1 Low 07 - Mens | shopwss.com | color not stated |
| r4 | ➖ unclear | Nike Men's Air Force 1 '07 Shoes - DICK'S Sporting Goods | dickssportinggoods.com | color not stated |
| r5 | ✅ same | Nike Air Force 1 Low '07 White | stockx.com | AF1 Low '07 White |
| r6 | ➖ unclear | Nike Air Force 1 '07 - YouTube | youtube.com | video, color not stated |
| r7 | ❌ not same | White Air Force 1 Shoes. Nike.com | nike.com | category page |
| r8 | ❌ not same | 25+ Nike Air Force 1 Low '07 White for sale / Updated Oct 2026 - eBay | ebay.com | listing of 25+ items |
| r9 | ➖ unclear | Nike Air Force 1 '07 | footlocker.com | color not stated |

## Adidas Samba OG Shoes Cloud White / Core Black

| ID | Label | Candidate (shoes) | Shop | Note |
|---|---|---|---|---|
| r0 | ➖ unclear | Samba OG Shoes | adidas.co.uk | color not stated |
| r1 | ➖ unclear | Samba OG Shoes | adidas.co.uk | color not stated |
| r2 | ➖ unclear | adidas Samba OG Shoes in Black and White | adidas.co.uk | 'Black and White' collection wording |
| r3 | ➖ unclear | adidas Originals Samba OG Trainer | footasylum.com | color not stated |
| r4 | ❌ not same | adidas Samba / Foot Locker UK | footlocker.co.uk | category page |
| r5 | ✅ same | Adidas Samba OG - Cloud White/Core Black/Clear Granite | pricerunner.com | Cloud White/Core Black/Clear Granite |
| r6 | ✅ same | adidas Samba Og Trainers Cloud White Black Gum - Offcuts | offcutsshoes.co.uk | white/black with gum sole (= Clear Granite) |
| r7 | ➖ unclear | adidas Samba OG Shoes - White | adidas.co.uk | 'White' only |
| r8 | ✅ same | adidas Samba OG - Trainers - cloud white/core black | zalando.co.uk | cloud white/core black |
| r9 | ➖ unclear | adidas Samba OG W (cloud white / core black) / 43einhalb Sneaker Store | 43einhalb.com | Samba OG W is the women's version; may be a separate product code |
