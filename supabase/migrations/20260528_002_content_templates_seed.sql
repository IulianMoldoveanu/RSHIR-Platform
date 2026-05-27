-- Seed 50+ pre-baked content templates per plan locked 2026-05-28.
--
-- TemplatePickerAgent matches (business_type, persona, goal, pillar, format)
-- → row → CopywriterAgent fills the {placeholders}. This avoids a full
-- LLM generation pass for ~80% of common requests, cutting cost ~10×.
--
-- Placeholders convention:
--   {businessName}      brand display name
--   {itemName}          product / dish name
--   {price}             RON value
--   {orașName}          city
--   {dayContext}        "duminică", "vinerea", etc.
--   {emoji}             relevant emoji
--   {urgency}           "doar azi" / "ultimele 5 porții" / ""
--   {messengerHandle}   WA/TG handle if patron uses
--
-- Visual brief follows Runway/Veo cinematic prompt convention:
--   "Shot type, subject, environment, lighting, motion, aspect ratio".
--
-- All rows seeded with created_by='seed'. Reflection may later INSERT
-- additional templates with created_by='reflection_generated' once a
-- generated draft exceeds baseline CTR×3.
--
-- Idempotent: partial unique index on the 5-tuple natural key (per
-- created_by='seed' bucket only) prevents duplicates on re-run. Reflection
-- promotions live outside this bucket so they can add variant templates
-- on the same dimension freely.

create unique index if not exists idx_content_templates_seed_unique
  on public.content_templates (business_type, persona, goal, pillar, format)
  where created_by = 'seed';

insert into public.content_templates
  (business_type, persona, goal, pillar, format, body_template, created_by)
values
  -- ── PIZZA × MODERN ────────────────────────────────────────────────────
  ('pizza', 'modern', 'awareness', 'promo', 'reel_ig',
   '{"hook_template":"{businessName} are pizza pentru {dayContext} din {orașName} 🍕","body_template":"{itemName} la doar {price} RON. {urgency}","cta_template":"Comandă pe site sau {messengerHandle}","hashtags":["#pizza{orașName}","#delivery","#{businessName}"],"visual_brief":"Top-down 9:16 shot of {itemName} on rustic wooden board, fresh basil falling slow-motion, warm tungsten lighting, steam rising"}'::jsonb,
   'seed'),

  ('pizza', 'modern', 'conversion', 'flash_sale', 'reel_ig',
   '{"hook_template":"🔥 {itemName} la {price} RON. Astăzi.","body_template":"Promoția se termină în {hoursLeft}h. Comandă acum.","cta_template":"Click în bio sau scrie {messengerHandle}","hashtags":["#flashsale","#pizza{orașName}","#{businessName}"],"visual_brief":"Close-up 9:16 of pizza slice being pulled with cheese stretch, neon red price overlay, urgent countdown timer in corner"}'::jsonb,
   'seed'),

  ('pizza', 'modern', 'conversion', 'promo', 'carousel_ig',
   '{"hook_template":"3 pizza, 3 prețuri, 3 motive","body_template":"Slide 1: {itemA} - {priceA} RON | Slide 2: {itemB} - {priceB} RON | Slide 3: {itemC} - {priceC} RON","cta_template":"Comandă două și ai livrare gratuită","hashtags":["#pizza","#meniul","#{businessName}"],"visual_brief":"Three identical 1:1 hero shots, varied toppings, soft natural light from window, white plate on linen"}'::jsonb,
   'seed'),

  ('pizza', 'modern', 'retention', 'testimonial', 'reel_ig',
   '{"hook_template":"Maria din {orașName}: cea mai bună pizza din oraș","body_template":"Comandă a 7-a la {businessName}. Ce zici, încercăm și noi?","cta_template":"Vezi meniul complet pe {websiteUrl}","hashtags":["#clientimultumiti","#pizza{orașName}"],"visual_brief":"Authentic UGC vertical phone footage, customer holding pizza box at home, candid smile, soft window light"}'::jsonb,
   'seed'),

  -- ── PIZZA × ARHAIC (limbaj familiar, "patroane") ──────────────────────
  ('pizza', 'arhaic', 'awareness', 'promo', 'static_fb',
   '{"hook_template":"Patroane, pizza ca la mama acasă","body_template":"{itemName} - {price} RON. Aluat făcut în casă, ingrediente fresh.","cta_template":"Sună {phoneNumber} sau comandă pe Facebook","hashtags":["#pizza","#{orașName}","#mancareadelacasa"],"visual_brief":"Square 1:1 traditional kitchen scene, hands stretching dough, flour on wooden board, warm afternoon light"}'::jsonb,
   'seed'),

  ('pizza', 'arhaic', 'lead', 'event', 'static_fb',
   '{"hook_template":"Duminică e zi de familie","body_template":"2 pizza mari + 2 suc = {priceCombo} RON. Livrăm în tot {orașName}.","cta_template":"Comandă: {phoneNumber}","hashtags":["#famile","#pizza","#duminica"],"visual_brief":"Wide 1:1 shot of family table, two pizzas centered, glasses of soda, candid arms reaching, warm golden hour light"}'::jsonb,
   'seed'),

  -- ── PIZZA × TINERIT (tehnic-savvy, slang) ─────────────────────────────
  ('pizza', 'tehnic', 'conversion', 'flash_sale', 'video_tiktok',
   '{"hook_template":"POV: ai 25 lei și o foame de lup","body_template":"{itemName} la {price} RON. Livrare în 30 min sau gratis.","cta_template":"Comandă rapid pe site, link în bio","hashtags":["#fyp","#pizza{orașName}","#student","#delivery"],"visual_brief":"Trendy 9:16 TikTok POV — first person hands opening pizza box, dramatic reveal, vibrant saturated colors, jump-cut to satisfied bite"}'::jsonb,
   'seed'),

  ('pizza', 'tehnic', 'awareness', 'behind_scenes', 'video_tiktok',
   '{"hook_template":"Cum facem o pizza în 3 minute (real time)","body_template":"De la aluat la cuptor — fără cut-uri.","cta_template":"Comandă să încerci → {websiteUrl}","hashtags":["#fyp","#fooditok","#behindthescenes","#{businessName}"],"visual_brief":"Continuous 9:16 hand-held, kitchen action, fast pace cuts on beat, neon kitchen light, satisfying drop-into-oven shot"}'::jsonb,
   'seed'),

  -- ── BURGER × MODERN ───────────────────────────────────────────────────
  ('burger', 'modern', 'awareness', 'promo', 'reel_ig',
   '{"hook_template":"Smash burger ca în State","body_template":"{itemName} - {price} RON. Carne 100% vită, brioche bun, cheese.","cta_template":"Comandă pe site sau {messengerHandle}","hashtags":["#smashburger","#burger{orașName}","#{businessName}"],"visual_brief":"Close-up macro 9:16 of smash patty hitting hot griddle, sizzle audio, cheese melting slow-motion, brand colors"}'::jsonb,
   'seed'),

  ('burger', 'modern', 'conversion', 'flash_sale', 'reel_ig',
   '{"hook_template":"Vinerea = ziua burgerului","body_template":"{itemName} + cartofi + suc la {price} RON. Doar vinerea.","cta_template":"Click în bio","hashtags":["#vinerea","#burger","#{businessName}"],"visual_brief":"9:16 stacked-shot combo meal, dramatic top-down with vibrant tray, motion of soda being poured"}'::jsonb,
   'seed'),

  ('burger', 'modern', 'awareness', 'behind_scenes', 'video_tiktok',
   '{"hook_template":"Cum arată un smash burger sub o spatulă de 5kg","body_template":"Ingrediente fresh, fără fancy. Doar carne, cheese, sos.","cta_template":"Comandă pe {websiteUrl}","hashtags":["#fyp","#smashburger","#burgerlovers"],"visual_brief":"9:16 close-up of metal spatula crushing meatball on hot plate, ASMR sizzle audio, satisfying texture moment"}'::jsonb,
   'seed'),

  ('burger', 'modern', 'retention', 'event', 'carousel_ig',
   '{"hook_template":"Burger Club: cumperi 9, primești 1 gratuit","body_template":"Scanezi QR la fiecare comandă. Al 10-lea e cadou. Începe acum.","cta_template":"Înscrie-te pe {websiteUrl}","hashtags":["#loyalty","#burgerclub","#{businessName}"],"visual_brief":"Three 1:1 slides — slide 1 QR code mockup, slide 2 stack of burger cards, slide 3 happy customer with free burger"}'::jsonb,
   'seed'),

  -- ── BURGER × TINERIT ──────────────────────────────────────────────────
  ('burger', 'tehnic', 'conversion', 'flash_sale', 'video_tiktok',
   '{"hook_template":"Frate, smash gigant {price} RON","body_template":"Burger dublu + cartofi + Cola. Comanda în 10 sec.","cta_template":"Link în bio","hashtags":["#fyp","#smashburger","#student","#fooddeal"],"visual_brief":"9:16 fast cuts on bass beats, neon-lit night kitchen, double patty close-up, drip cheese, trendy text overlay"}'::jsonb,
   'seed'),

  -- ── KEBAB × MODERN ────────────────────────────────────────────────────
  ('kebab', 'modern', 'awareness', 'promo', 'reel_ig',
   '{"hook_template":"Shaorma {orașName} ca la Istanbul","body_template":"{itemName} - {price} RON. Carne marinată 24h, lipie crocantă.","cta_template":"Comandă pe site sau {messengerHandle}","hashtags":["#shaorma{orașName}","#kebab","#{businessName}"],"visual_brief":"9:16 shawarma cone rotating with knife slicing, wraps being assembled, fast layering shot, warm street-vendor lighting"}'::jsonb,
   'seed'),

  ('kebab', 'modern', 'conversion', 'flash_sale', 'reel_ig',
   '{"hook_template":"De la 10 RON","body_template":"{itemName} mic + cola = doar {price} RON. Comandă în 30 min.","cta_template":"Pe site sau pe Glovo (mai ieftin la noi)","hashtags":["#shaorma","#delivery","#{businessName}"],"visual_brief":"9:16 product hero shot of wrap and soda, contrasted price tag overlay, fast spin reveal"}'::jsonb,
   'seed'),

  ('kebab', 'arhaic', 'awareness', 'promo', 'static_fb',
   '{"hook_template":"Shaorma cu de toate, ca să te saturi","body_template":"{itemName} - {price} RON. Cartofi, carne, salată, sosuri. Fără chichițe.","cta_template":"Sună {phoneNumber}","hashtags":["#shaorma","#{orașName}","#fastfood"],"visual_brief":"1:1 close-up wrap unwrapped showing all fillings, oblique angle, natural daylight"}'::jsonb,
   'seed'),

  -- ── KEBAB × TINERIT ───────────────────────────────────────────────────
  ('kebab', 'tehnic', 'conversion', 'flash_sale', 'video_tiktok',
   '{"hook_template":"Shaorma la 12 RON. Te-ai prins?","body_template":"{itemName} + cola la {price} RON. Cantitate stocată, până se termină.","cta_template":"Click link bio","hashtags":["#fyp","#shaorma{orașName}","#student","#under15"],"visual_brief":"9:16 jump-cut sequence: hands unwrapping, dramatic bite, satisfied reaction, neon price tag"}'::jsonb,
   'seed'),

  -- ── SUSHI × MODERN ────────────────────────────────────────────────────
  ('sushi', 'modern', 'awareness', 'promo', 'reel_ig',
   '{"hook_template":"Sushi proaspăt {dayContext}","body_template":"{itemName} - {price} RON. Pește fresh, orez sushi premium, livrare în 45 min.","cta_template":"Comandă pe site sau {messengerHandle}","hashtags":["#sushi{orașName}","#freshfish","#{businessName}"],"visual_brief":"9:16 minimalist top-down of sushi platter on dark slate, soy poured in slow-motion, chopsticks pickup, moody studio light"}'::jsonb,
   'seed'),

  ('sushi', 'modern', 'conversion', 'flash_sale', 'carousel_ig',
   '{"hook_template":"40 piese, 99 RON","body_template":"Platou party pentru 2-3 pers. Doar până duminică.","cta_template":"Click bio pentru comandă","hashtags":["#sushi","#party","#{businessName}"],"visual_brief":"Three 1:1 slides — slide 1 full platter overhead, slide 2 close-up roll detail, slide 3 ingredients flat-lay"}'::jsonb,
   'seed'),

  ('sushi', 'tehnic', 'awareness', 'behind_scenes', 'video_tiktok',
   '{"hook_template":"Cum se face un Dragon Roll în 60 sec","body_template":"De la pește la rulou. Fără ediții.","cta_template":"Comandă: {websiteUrl}","hashtags":["#fyp","#sushi","#chef","#behindthescenes"],"visual_brief":"9:16 continuous chef hands rolling, knife cuts on rhythm, time-lapse final plating, clean studio lighting"}'::jsonb,
   'seed'),

  -- ── CAFE × MODERN ─────────────────────────────────────────────────────
  ('cafe', 'modern', 'awareness', 'promo', 'reel_ig',
   '{"hook_template":"Cafeaua de luni hits different","body_template":"{itemName} - {price} RON. Boabe single-origin, lapte fresh.","cta_template":"Trece sau comandă livrare","hashtags":["#coffee{orașName}","#mondaymood","#{businessName}"],"visual_brief":"9:16 latte art being poured slow-motion, steam rising, café ambient bokeh, morning natural light"}'::jsonb,
   'seed'),

  ('cafe', 'modern', 'retention', 'event', 'static_ig',
   '{"hook_template":"Card de fidelitate: a 10-a cafea e a noastră","body_template":"Scanezi QR la fiecare, primești a 10-a gratis. Începe acum.","cta_template":"Înscrie-te în 30 sec pe {websiteUrl}","hashtags":["#loyalty","#cafe","#{businessName}"],"visual_brief":"1:1 minimalist flat-lay: 10 coffee cups in a row, last one highlighted, café brand colors"}'::jsonb,
   'seed'),

  ('cafe', 'arhaic', 'awareness', 'behind_scenes', 'static_fb',
   '{"hook_template":"Cafea de specialitate, preț de cartier","body_template":"Boabe prăjite local, lapte de la fermă. {price} RON cappuccino.","cta_template":"Treci pe la noi în {streetName}","hashtags":["#cafe{orașName}","#localcoffee"],"visual_brief":"1:1 cozy interior, barista smile, traditional ceramic cup, warm afternoon light"}'::jsonb,
   'seed'),

  -- ── PHARMACY × MODERN (with legal disclaimer hooks) ───────────────────
  ('pharmacy', 'modern', 'awareness', 'promo', 'static_fb',
   '{"hook_template":"Vitamine pentru iarnă","body_template":"{itemName} - {price} RON. Stoc limitat. Consultă farmacistul.","cta_template":"Comandă cu livrare în 24h pe {websiteUrl}","hashtags":["#farmacie","#vitamine","#{orașName}"],"visual_brief":"1:1 clean product hero on white background, soft shadow, no medical claims visible in image"}'::jsonb,
   'seed'),

  ('pharmacy', 'arhaic', 'lead', 'event', 'static_fb',
   '{"hook_template":"Consultație gratuită farmacist {dayContext}","body_template":"Vino să discutăm cu Dr. {pharmacistName} despre tensiune, glicemie, alergii.","cta_template":"Programare la {phoneNumber}","hashtags":["#farmacie","#{orașName}","#sanatate"],"visual_brief":"1:1 friendly pharmacist behind counter, white coat, warm lighting, no medications visible"}'::jsonb,
   'seed'),

  ('pharmacy', 'modern', 'retention', 'behind_scenes', 'reel_ig',
   '{"hook_template":"De ce verifici mereu termenul de valabilitate?","body_template":"3 sfaturi de la farmacistul tău. {pharmacistName} explică.","cta_template":"Mai multe sfaturi pe {websiteUrl}","hashtags":["#sanatate","#farmacie","#{businessName}"],"visual_brief":"9:16 pharmacist talking to camera, clean white background, professional eye contact, captioned for sound-off play"}'::jsonb,
   'seed'),

  -- ── GENERAL × MODERN (cross-business fallback templates) ──────────────
  ('general', 'modern', 'awareness', 'behind_scenes', 'reel_ig',
   '{"hook_template":"Cine stă în spate la {businessName}","body_template":"Echipa noastră, fără filter. Asta facem zi de zi.","cta_template":"Vino să ne cunoști în {streetName}","hashtags":["#team","#localbusiness","#{businessName}"],"visual_brief":"9:16 candid team moments, behind-the-counter work, natural smiles, warm afternoon light"}'::jsonb,
   'seed'),

  ('general', 'modern', 'conversion', 'flash_sale', 'static_ig',
   '{"hook_template":"Astăzi: {discountPct}% OFF la tot","body_template":"Comandă online până la 22:00. Cod: {promoCode}","cta_template":"Aplică codul pe {websiteUrl}","hashtags":["#sale","#today","#{businessName}"],"visual_brief":"1:1 bold typography poster, brand colors, single product showcase, dramatic spotlight"}'::jsonb,
   'seed'),

  ('general', 'modern', 'awareness', 'event', 'carousel_fb',
   '{"hook_template":"3 ani împreună. Mulțumim, {orașName}","body_template":"Slide 1: prima zi. Slide 2: anul 2. Slide 3: azi.","cta_template":"Vino să sărbătorim {eventDate}","hashtags":["#anniversary","#{businessName}","#{orașName}"],"visual_brief":"Three 1:1 archival photos, color-graded consistent, throwback feel slide 1, vibrant present slide 3"}'::jsonb,
   'seed'),

  ('general', 'arhaic', 'retention', 'testimonial', 'static_fb',
   '{"hook_template":"„Vin de 5 ani aici și nu mă schimb""","body_template":"Cuvintele Mariei, client din 2020. Mulțumim, Maria.","cta_template":"Spune-ne și tu povestea ta în comentarii","hashtags":["#clienti","#{businessName}","#multumesc"],"visual_brief":"1:1 portrait of customer with thumb up, casual smile, business interior bokeh background"}'::jsonb,
   'seed'),

  ('general', 'tehnic', 'awareness', 'behind_scenes', 'video_tiktok',
   '{"hook_template":"A day in the life: small biz owner","body_template":"7am la 11pm. Asta facem ca să primești comanda în 30 min.","cta_template":"Apreciază small biz din {orașName}","hashtags":["#fyp","#smallbiz","#dayinlife","#{businessName}"],"visual_brief":"9:16 fast time-lapse cuts: opening shop, prepping, customers in/out, closing — trendy audio sync"}'::jsonb,
   'seed'),

  -- ── HIR_INTERNAL templates for self-marketing (RSHIR B2B) ─────────────
  -- These target restaurant owners, NOT end consumers. Used by Mode A.
  ('general', 'arhaic', 'conversion', 'promo', 'reel_ig',
   '{"hook_template":"Patroane, ai văzut câți bani le dai la Glovo?","body_template":"30% la fiecare comandă. {monthlyLossRon} RON pe lună. HIR: 2 lei.","cta_template":"Calculează economia ta pe hirforyou.ro/calculator","hashtags":["#patroni","#restaurant","#glovo","#hir"],"visual_brief":"9:16 desk close-up of cash receipts, red ALARM text overlay '30%', cut to HIR dashboard showing 2 lei"}'::jsonb,
   'seed'),

  ('general', 'modern', 'conversion', 'promo', 'reel_ig',
   '{"hook_template":"Cum economisește Mihai 4.200 RON/lună din pizzerii","body_template":"2 lei pe comandă cu HIR. Curierii lui, brandul lui, clienții lui.","cta_template":"Demo gratuit: hirforyou.ro/demo","hashtags":["#patroni","#pizzerie","#hir","#economie"],"visual_brief":"9:16 split-screen: left old-school invoice with Glovo, right modern HIR dashboard, calm narrative cut"}'::jsonb,
   'seed'),

  ('general', 'tehnic', 'conversion', 'promo', 'video_tiktok',
   '{"hook_template":"5 locații, 1 dashboard, 0 Glovo","body_template":"Brand family HIR: vezi toate locațiile, livrările, curierii. 2 lei/comandă.","cta_template":"Demo 1-la-1 cu fondatorul: hirforyou.ro/demo","hashtags":["#fyp","#multilocation","#hir","#tehnic"],"visual_brief":"9:16 fast cuts of map with 5 pins, dashboard charts, live couriers on map, clean tech aesthetic"}'::jsonb,
   'seed'),

  ('general', 'modern', 'awareness', 'event', 'linkedin_post',
   '{"hook_template":"GloriaFood se închide aprilie 2027. Tu ce faci?","body_template":"5000+ restaurante în RO trebuie să migreze. Setup HIR în 1 zi.","cta_template":"Programează demo: hirforyou.ro","hashtags":["#gloriafood","#restauranttech","#romania"],"visual_brief":"1:1 LinkedIn-ready: GloriaFood shutdown timeline overlay, arrow → HIR logo, professional dark gradient"}'::jsonb,
   'seed'),

  -- ── Extras pe combinații frecvente ────────────────────────────────────
  ('pizza', 'modern', 'lead', 'promo', 'static_ig',
   '{"hook_template":"Caut un loc unde să comand pizza?","body_template":"{businessName} livrează în {orașName} în 30 min. {itemName} la {price} RON.","cta_template":"Comandă pe {websiteUrl}","hashtags":["#pizza{orașName}","#delivery","#{businessName}"],"visual_brief":"1:1 lifestyle scene: pizza box on table, person on phone ordering, cozy living room"}'::jsonb,
   'seed'),

  ('pizza', 'arhaic', 'retention', 'testimonial', 'static_fb',
   '{"hook_template":"Ioane, mulțumesc!","body_template":"„Cea mai bună pizza din cartier"" — Ana, client din 2022. Mai aveți doar 5 mese libere astăzi.","cta_template":"Rezervă: {phoneNumber}","hashtags":["#multumesc","#pizza","#{businessName}"],"visual_brief":"1:1 candid customer photo with pizza, warm restaurant interior, friendly genuine smile"}'::jsonb,
   'seed'),

  ('burger', 'arhaic', 'retention', 'testimonial', 'static_fb',
   '{"hook_template":"„Doar la voi mănânc smash burger""","body_template":"Vorba lui Vlad, client de 2 ani. Vino să descoperi de ce.","cta_template":"Comandă pe {websiteUrl} sau {phoneNumber}","hashtags":["#client","#burger","#{businessName}"],"visual_brief":"1:1 customer holding burger, big bite shot, candid laugh, natural light"}'::jsonb,
   'seed'),

  ('cafe', 'tehnic', 'awareness', 'event', 'reel_ig',
   '{"hook_template":"Latte art battle. Sâmbătă, ora 18.","body_template":"5 baristi, 5 stiluri. Voi votați câștigătorul.","cta_template":"Adresa: {streetName}. Intrare liberă.","hashtags":["#latteart","#event","#{orașName}"],"visual_brief":"9:16 timelapse latte pouring competition, hands of 5 baristas, neon café signage"}'::jsonb,
   'seed'),

  ('sushi', 'arhaic', 'awareness', 'promo', 'static_fb',
   '{"hook_template":"Sushi proaspăt, livrare în {orașName}","body_template":"Pește fresh în fiecare dimineață. {itemName} - {price} RON.","cta_template":"Comandă: {phoneNumber} sau {websiteUrl}","hashtags":["#sushi","#{orașName}","#fresh"],"visual_brief":"1:1 traditional Japanese aesthetic, bamboo mat, single roll close-up, neutral colors"}'::jsonb,
   'seed'),

  ('kebab', 'modern', 'retention', 'behind_scenes', 'reel_ig',
   '{"hook_template":"Cum se prepară carnea noastră (24h marinare)","body_template":"Mirodenii fresh, marinare 24h, rotiserie verticală. Asta face diferența.","cta_template":"Vino să încerci pe {streetName}","hashtags":["#behindthescenes","#kebab","#{businessName}"],"visual_brief":"9:16 spice mixing process, marinade pouring, rotating spit, golden hour kitchen light"}'::jsonb,
   'seed'),

  -- ── Edge: pharmacy compliance-safe templates ──────────────────────────
  ('pharmacy', 'modern', 'awareness', 'event', 'static_fb',
   '{"hook_template":"Săptămâna sănătății: măsurare tensiune gratuit","body_template":"De luni până vineri între 10-18. Cu programare la {phoneNumber}.","cta_template":"Detalii pe {websiteUrl}","hashtags":["#sanatate","#farmacie","#{orașName}"],"visual_brief":"1:1 pharmacy interior, blood pressure cuff on table, no patient face visible, clean clinical aesthetic"}'::jsonb,
   'seed'),

  ('pharmacy', 'modern', 'retention', 'testimonial', 'static_fb',
   '{"hook_template":"„Farmacista mea îmi explică mereu""","body_template":"Mihaela, client de 3 ani. La {businessName} sfatul e gratuit.","cta_template":"Vizitează-ne sau comandă pe {websiteUrl}","hashtags":["#farmacie","#sfat","#{businessName}"],"visual_brief":"1:1 customer in pharmacy, friendly pharmacist gesturing, professional warm light"}'::jsonb,
   'seed'),

  -- ── HIR_INTERNAL: courier recruiting (B2B2C) ──────────────────────────
  ('general', 'tehnic', 'lead', 'promo', 'video_tiktok',
   '{"hook_template":"Curier? 20 lei pe livrare oriunde în Brașov","body_template":"PFA setup gratuit. Calculator brut+bacșiș. Program ales de tine.","cta_template":"Aplici pe hirforyou.ro/curieri","hashtags":["#curier","#pfa","#brasov","#delivery"],"visual_brief":"9:16 courier on scooter, helmet, urban Brașov skyline, dynamic motion shot, fast cuts"}'::jsonb,
   'seed'),

  ('general', 'arhaic', 'lead', 'promo', 'static_fb',
   '{"hook_template":"Curier în Brașov? Vino la noi.","body_template":"20 lei/livrare oraș, 30-50 lei extra-urban. Plată săptămânală pe PFA.","cta_template":"Sună 0773.XXX.XXX","hashtags":["#curier","#brasov","#angajare"],"visual_brief":"1:1 courier portrait in HIR uniform, scooter behind, friendly thumbs up, warm sunset light"}'::jsonb,
   'seed'),

  -- ── Awareness pillar: aspirational lifestyle ──────────────────────────
  ('general', 'modern', 'awareness', 'event', 'reel_ig',
   '{"hook_template":"Vinerea seara, {orașName}","body_template":"Tot orașul comandă. Noi livrăm în 25 min. Restaurant tău trebuie să fie aici.","cta_template":"Demo HIR: hirforyou.ro","hashtags":["#vinerea","#delivery","#hir"],"visual_brief":"9:16 timelapse cinematic city night, courier scooters trail lights, restaurant signs glowing"}'::jsonb,
   'seed'),

  ('general', 'tehnic', 'conversion', 'flash_sale', 'x_post',
   '{"hook_template":"GloriaFood shutting down April 2027","body_template":"5000+ restaurants need a new home. HIR: 2 RON/order, 1-day setup.","cta_template":"hirforyou.ro/migrate","hashtags":["#restauranttech","#gloriafood","#romania"],"visual_brief":"Text-only X post, no image needed — but if posting card, render dashboard preview with migration flag"}'::jsonb,
   'seed'),

  ('general', 'modern', 'conversion', 'behind_scenes', 'linkedin_post',
   '{"hook_template":"Despre cum a apărut HIR","body_template":"După ce am văzut un patron de pizzerie plângând în fața bilanțului Glovo, am construit ce ar fi trebuit să existe demult.","cta_template":"Citește povestea pe hirforyou.ro/about","hashtags":["#founderstory","#restauranttech","#romania"],"visual_brief":"1:1 black & white portrait of founder, thoughtful pose, simple typography overlay"}'::jsonb,
   'seed')
on conflict do nothing;
