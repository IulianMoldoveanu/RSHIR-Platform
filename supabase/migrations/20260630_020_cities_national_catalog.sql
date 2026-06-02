-- Migration: cities national catalog (all Romanian cities & towns)
--
-- Point 2 of the HIR Curier ops roadmap: "be able to bring ALL Romanian cities
-- into the system", not just the 12 launch cities seeded in
-- 20260506_011_cities_multi_city.sql.
--
-- We seed the full national catalog of municipii + orașe (~310 urban
-- localities) so couriers and fleets can be assigned anywhere in the country.
-- New rows are inserted with is_active = false on purpose:
--   * is_active = true is what the PUBLIC storefront / sitemap surface
--     (apps/restaurant-web getActiveCities() filters .eq('is_active', true)),
--     so flipping every city live would flood SEO with empty cities.
--   * The 12 launch cities seeded earlier keep is_active = true (their rows are
--     untouched here thanks to ON CONFLICT DO NOTHING).
--   * Courier / fleet admin surfaces read the FULL catalog regardless of the
--     flag — onboarding a courier in a new city is how HIR expands there.
-- Activating a city later = a one-line `update public.cities set is_active=true`.
--
-- Slugs are generated deterministically with unaccent() so there is no manual
-- slug column to typo across 300 rows: lower + strip diacritics + non-alnum→'-'.
-- ON CONFLICT DO NOTHING skips any row whose name OR slug already exists (the
-- 12 launch cities, and any accidental in-list duplicate).

create extension if not exists unaccent;

insert into public.cities (name, slug, county, is_active, sort_order)
select
  v.name,
  trim(both '-' from regexp_replace(lower(unaccent(v.name)), '[^a-z0-9]+', '-', 'g')),
  v.county,
  false,
  500
from (values
  -- Alba
  ('Alba Iulia','Alba'),('Aiud','Alba'),('Blaj','Alba'),('Sebeș','Alba'),
  ('Abrud','Alba'),('Baia de Arieș','Alba'),('Câmpeni','Alba'),('Cugir','Alba'),
  ('Ocna Mureș','Alba'),('Teiuș','Alba'),('Zlatna','Alba'),
  -- Arad
  ('Arad','Arad'),('Chișineu-Criș','Arad'),('Curtici','Arad'),('Ineu','Arad'),
  ('Lipova','Arad'),('Nădlac','Arad'),('Pâncota','Arad'),('Pecica','Arad'),
  ('Sântana','Arad'),('Sebiș','Arad'),
  -- Argeș
  ('Pitești','Argeș'),('Câmpulung','Argeș'),('Curtea de Argeș','Argeș'),
  ('Costești','Argeș'),('Mioveni','Argeș'),('Ștefănești','Argeș'),('Topoloveni','Argeș'),
  -- Bacău
  ('Bacău','Bacău'),('Moinești','Bacău'),('Onești','Bacău'),('Buhuși','Bacău'),
  ('Comănești','Bacău'),('Dărmănești','Bacău'),('Slănic-Moldova','Bacău'),('Târgu Ocna','Bacău'),
  -- Bihor
  ('Oradea','Bihor'),('Beiuș','Bihor'),('Marghita','Bihor'),('Salonta','Bihor'),
  ('Aleșd','Bihor'),('Nucet','Bihor'),('Săcueni','Bihor'),('Ștei','Bihor'),
  ('Valea lui Mihai','Bihor'),('Vașcău','Bihor'),
  -- Bistrița-Năsăud
  ('Bistrița','Bistrița-Năsăud'),('Beclean','Bistrița-Năsăud'),('Năsăud','Bistrița-Năsăud'),
  ('Sângeorz-Băi','Bistrița-Năsăud'),
  -- Botoșani
  ('Botoșani','Botoșani'),('Dorohoi','Botoșani'),('Bucecea','Botoșani'),('Darabani','Botoșani'),
  ('Flămânzi','Botoșani'),('Săveni','Botoșani'),('Ștefănești-Botoșani','Botoșani'),
  -- Brașov
  ('Brașov','Brașov'),('Codlea','Brașov'),('Făgăraș','Brașov'),('Săcele','Brașov'),
  ('Ghimbav','Brașov'),('Predeal','Brașov'),('Râșnov','Brașov'),('Rupea','Brașov'),
  ('Victoria','Brașov'),('Zărnești','Brașov'),
  -- Brăila
  ('Brăila','Brăila'),('Făurei','Brăila'),('Ianca','Brăila'),('Însurăței','Brăila'),
  -- Buzău
  ('Buzău','Buzău'),('Râmnicu Sărat','Buzău'),('Nehoiu','Buzău'),('Pătârlagele','Buzău'),
  ('Pogoanele','Buzău'),
  -- Caraș-Severin
  ('Reșița','Caraș-Severin'),('Caransebeș','Caraș-Severin'),('Anina','Caraș-Severin'),
  ('Băile Herculane','Caraș-Severin'),('Bocșa','Caraș-Severin'),('Moldova Nouă','Caraș-Severin'),
  ('Oravița','Caraș-Severin'),('Oțelu Roșu','Caraș-Severin'),
  -- Călărași
  ('Călărași','Călărași'),('Oltenița','Călărași'),('Budești','Călărași'),
  ('Fundulea','Călărași'),('Lehliu Gară','Călărași'),
  -- Cluj
  ('Cluj-Napoca','Cluj'),('Câmpia Turzii','Cluj'),('Dej','Cluj'),('Gherla','Cluj'),
  ('Turda','Cluj'),('Huedin','Cluj'),
  -- Constanța
  ('Constanța','Constanța'),('Mangalia','Constanța'),('Medgidia','Constanța'),
  ('Cernavodă','Constanța'),('Eforie','Constanța'),('Hârșova','Constanța'),
  ('Murfatlar','Constanța'),('Năvodari','Constanța'),('Negru Vodă','Constanța'),
  ('Ovidiu','Constanța'),('Techirghiol','Constanța'),
  -- Covasna
  ('Sfântu Gheorghe','Covasna'),('Târgu Secuiesc','Covasna'),('Baraolt','Covasna'),
  ('Covasna','Covasna'),('Întorsura Buzăului','Covasna'),
  -- Dâmbovița
  ('Târgoviște','Dâmbovița'),('Moreni','Dâmbovița'),('Fieni','Dâmbovița'),
  ('Găești','Dâmbovița'),('Pucioasa','Dâmbovița'),('Răcari','Dâmbovița'),('Titu','Dâmbovița'),
  -- Dolj
  ('Craiova','Dolj'),('Băilești','Dolj'),('Calafat','Dolj'),('Bechet','Dolj'),
  ('Dăbuleni','Dolj'),('Filiași','Dolj'),('Segarcea','Dolj'),
  -- Galați
  ('Galați','Galați'),('Tecuci','Galați'),('Berești','Galați'),('Târgu Bujor','Galați'),
  -- Giurgiu
  ('Giurgiu','Giurgiu'),('Bolintin-Vale','Giurgiu'),('Mihăilești','Giurgiu'),
  -- Gorj
  ('Târgu Jiu','Gorj'),('Motru','Gorj'),('Bumbești-Jiu','Gorj'),('Novaci','Gorj'),
  ('Rovinari','Gorj'),('Târgu Cărbunești','Gorj'),('Țicleni','Gorj'),('Tismana','Gorj'),('Turceni','Gorj'),
  -- Harghita
  ('Miercurea Ciuc','Harghita'),('Gheorgheni','Harghita'),('Odorheiu Secuiesc','Harghita'),
  ('Toplița','Harghita'),('Băile Tușnad','Harghita'),('Bălan','Harghita'),('Borsec','Harghita'),
  ('Cristuru Secuiesc','Harghita'),('Vlăhița','Harghita'),
  -- Hunedoara
  ('Deva','Hunedoara'),('Hunedoara','Hunedoara'),('Brad','Hunedoara'),('Lupeni','Hunedoara'),
  ('Orăștie','Hunedoara'),('Petroșani','Hunedoara'),('Vulcan','Hunedoara'),('Aninoasa','Hunedoara'),
  ('Călan','Hunedoara'),('Geoagiu','Hunedoara'),('Hațeg','Hunedoara'),('Petrila','Hunedoara'),
  ('Simeria','Hunedoara'),('Uricani','Hunedoara'),
  -- Ialomița
  ('Slobozia','Ialomița'),('Fetești','Ialomița'),('Urziceni','Ialomița'),('Amara','Ialomița'),
  ('Căzănești','Ialomița'),('Fierbinți-Târg','Ialomița'),('Țăndărei','Ialomița'),
  -- Iași
  ('Iași','Iași'),('Pașcani','Iași'),('Hârlău','Iași'),('Podu Iloaiei','Iași'),('Târgu Frumos','Iași'),
  -- Ilfov
  ('Buftea','Ilfov'),('Bragadiru','Ilfov'),('Chitila','Ilfov'),('Măgurele','Ilfov'),
  ('Otopeni','Ilfov'),('Pantelimon','Ilfov'),('Popești-Leordeni','Ilfov'),('Voluntari','Ilfov'),
  -- Maramureș
  ('Baia Mare','Maramureș'),('Sighetu Marmației','Maramureș'),('Borșa','Maramureș'),
  ('Cavnic','Maramureș'),('Dragomirești','Maramureș'),('Săliștea de Sus','Maramureș'),
  ('Seini','Maramureș'),('Șomcuta Mare','Maramureș'),('Tăuții-Măgherăuș','Maramureș'),
  ('Târgu Lăpuș','Maramureș'),('Ulmeni','Maramureș'),('Vișeu de Sus','Maramureș'),('Baia Sprie','Maramureș'),
  -- Mehedinți
  ('Drobeta-Turnu Severin','Mehedinți'),('Orșova','Mehedinți'),('Baia de Aramă','Mehedinți'),
  ('Strehaia','Mehedinți'),('Vânju Mare','Mehedinți'),
  -- Mureș
  ('Târgu Mureș','Mureș'),('Reghin','Mureș'),('Sighișoara','Mureș'),('Târnăveni','Mureș'),
  ('Iernut','Mureș'),('Luduș','Mureș'),('Miercurea Nirajului','Mureș'),('Sângeorgiu de Pădure','Mureș'),
  ('Sărmașu','Mureș'),('Sovata','Mureș'),('Ungheni','Mureș'),
  -- Neamț
  ('Piatra Neamț','Neamț'),('Roman','Neamț'),('Bicaz','Neamț'),('Roznov','Neamț'),('Târgu Neamț','Neamț'),
  -- Olt
  ('Slatina','Olt'),('Caracal','Olt'),('Balș','Olt'),('Corabia','Olt'),('Drăgănești-Olt','Olt'),
  ('Piatra-Olt','Olt'),('Potcoava','Olt'),('Scornicești','Olt'),
  -- Prahova
  ('Ploiești','Prahova'),('Câmpina','Prahova'),('Azuga','Prahova'),('Băicoi','Prahova'),
  ('Boldești-Scăeni','Prahova'),('Breaza','Prahova'),('Bușteni','Prahova'),('Comarnic','Prahova'),
  ('Mizil','Prahova'),('Plopeni','Prahova'),('Sinaia','Prahova'),('Slănic','Prahova'),
  ('Urlați','Prahova'),('Vălenii de Munte','Prahova'),
  -- Satu Mare
  ('Satu Mare','Satu Mare'),('Carei','Satu Mare'),('Ardud','Satu Mare'),('Livada','Satu Mare'),
  ('Negrești-Oaș','Satu Mare'),('Tășnad','Satu Mare'),
  -- Sălaj
  ('Zalău','Sălaj'),('Cehu Silvaniei','Sălaj'),('Jibou','Sălaj'),('Șimleu Silvaniei','Sălaj'),
  -- Sibiu
  ('Sibiu','Sibiu'),('Mediaș','Sibiu'),('Agnita','Sibiu'),('Avrig','Sibiu'),('Cisnădie','Sibiu'),
  ('Copșa Mică','Sibiu'),('Dumbrăveni','Sibiu'),('Miercurea Sibiului','Sibiu'),
  ('Ocna Sibiului','Sibiu'),('Săliște','Sibiu'),('Tălmaciu','Sibiu'),
  -- Suceava
  ('Suceava','Suceava'),('Câmpulung Moldovenesc','Suceava'),('Fălticeni','Suceava'),
  ('Rădăuți','Suceava'),('Vatra Dornei','Suceava'),('Broșteni','Suceava'),('Cajvana','Suceava'),
  ('Dolhasca','Suceava'),('Frasin','Suceava'),('Gura Humorului','Suceava'),('Liteni','Suceava'),
  ('Milișăuți','Suceava'),('Salcea','Suceava'),('Siret','Suceava'),('Solca','Suceava'),('Vicovu de Sus','Suceava'),
  -- Teleorman
  ('Alexandria','Teleorman'),('Roșiori de Vede','Teleorman'),('Turnu Măgurele','Teleorman'),
  ('Videle','Teleorman'),('Zimnicea','Teleorman'),
  -- Timiș
  ('Timișoara','Timiș'),('Lugoj','Timiș'),('Buziaș','Timiș'),('Ciacova','Timiș'),('Deta','Timiș'),
  ('Făget','Timiș'),('Gătaia','Timiș'),('Jimbolia','Timiș'),('Recaș','Timiș'),('Sânnicolau Mare','Timiș'),
  -- Tulcea
  ('Tulcea','Tulcea'),('Babadag','Tulcea'),('Isaccea','Tulcea'),('Măcin','Tulcea'),('Sulina','Tulcea'),
  -- Vaslui
  ('Vaslui','Vaslui'),('Bârlad','Vaslui'),('Huși','Vaslui'),('Negrești-Vaslui','Vaslui'),('Murgeni','Vaslui'),
  -- Vâlcea
  ('Râmnicu Vâlcea','Vâlcea'),('Drăgășani','Vâlcea'),('Băbeni','Vâlcea'),('Bălcești','Vâlcea'),
  ('Berbești','Vâlcea'),('Brezoi','Vâlcea'),('Călimănești','Vâlcea'),('Horezu','Vâlcea'),('Ocnele Mari','Vâlcea'),
  -- Vrancea
  ('Focșani','Vrancea'),('Adjud','Vrancea'),('Mărășești','Vrancea'),('Odobești','Vrancea'),('Panciu','Vrancea')
) as v(name, county)
on conflict do nothing;

comment on table public.cities is
  'National catalog of Romanian cities/towns. is_active=true => live on the '
  'public storefront/sitemap; courier & fleet admin read the full catalog. '
  'Seeded launch cities in 20260506_011; full national catalog in 20260630_011.';
