# Catalogue audit - 25 October 2026

Scope: all 18 entries shown in the live /catalogues/ page. Desktop Chrome cloud browser; no physical iPhone/Android claim.

Baseline: every catalogue rendered its first page. For every multi-page file, pages 2 and 3, Previous, zoom in/out, and return to the catalogue listing passed. The one-page shuttering brochure correctly has no next page. All 18 original-download URLs returned HTTP 206 and a PDF signature for a small byte-range request. Every viewer used the shared 20261025-prepared-pages script.

| Catalogue | Pages | Initial opening ms | Sampled Next ms |
|---|---:|---:|---|
| Godrej | 144 | 3668 | 972, 1017 |
| IPSA | 94 | 11628 | 956, 1012 |
| MWUD | 78 | 4399 | 982, 988 |
| Rainbow | 36 | 21975 | 4007, 996 |
| Ristal 0.82mm | 60 | 13314 | 906, 1022 |
| Ristal 1mm | 61 | 7384 | 1000, 2083 |
| Ristal Slim 0.75mm | 35 | 7639 | 3011, 963 |
| Ristal Solid Colour 0.92mm | 50 | 13099 | 920, 1022 |
| Royal Crown | 79 | 10680 | 1029, 3102 |
| Senator | 88 | 13197 | 5009, 4195 |
| Woodline 0.8mm | 51 | 10168 | 936, 3089 |
| Woodline Acrylic | 37 | 4658 | 2986, 1031 |
| Woodline Doorskin | 40 | 10696 | 1999, 2034 |
| Woodline Louvers 8x5 | 8 | 6443 | 4068, 3030 |
| Woodline LED Louvers | 4 | 4276 | 1983, 3051 |
| Woodline Louvers 9.5x6 | 8 | 8412 | 3052, 4097 |
| Woodrick Kitchen | 28 | 11666 | 1986, 983 |
| Woodrick Shuttering | 1 | 2393 | N/A |

These are browser-interaction timings, including automation overhead and network conditions, not universal performance guarantees. The navigation cache worked, but first opening of several PDFs was too slow.

Improvement: build 2400-pixel WebP derivatives from every page of the current public originals during deployment. Serve them behind original ETag and vendor visibility checks. The shared viewer prefers these smaller pages and preserves the existing PDF engine as fallback. Original PDF download remains available. Generated derivatives are deployment assets, not committed duplicate source files. Source changes invalidate derivatives until the next build.
