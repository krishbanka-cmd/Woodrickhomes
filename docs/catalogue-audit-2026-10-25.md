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

## Published result

Production deployment: commit cfdbeddf309d979988636454d441b551db3c4e06, GitHub Actions run 40210832232 succeeded.

All 18 catalogue viewers reported `data-catalogue-mode=prepared-images`. Every multi-page catalogue passed sampled page 2 and 3 navigation, Previous, zoom in/out and return to listing. The single-page brochure passed opening, zoom and return. No routine loading badge was visible after pages were ready. Every catalogue's page count matched the original PDF; total 902.

| Catalogue | Published initial open ms | Sampled Next ms |
|---|---:|---|
| Godrej (first uncached viewer/module load) | 9430 | 897, 1016 |
| IPSA | 1031 | 468, 816 |
| MWUD | 1092 | 510, 1009 |
| Rainbow | 1278 | 986, 1014 |
| Ristal 0.82mm | 1079 | 478, 750 |
| Ristal 1mm | 1228 | 1073, 1006 |
| Ristal Slim | 1312 | 533, 669 |
| Ristal Solid Colour | 1191 | 510, 915 |
| Royal Crown | 1887 | 729, 831 |
| Senator | 2044 | 840, 795 |
| Woodline 0.8mm | 1048 | 404, 797 |
| Woodline Acrylic | 1061 | 495, 1011 |
| Woodline Doorskin | 1222 | 505, 903 |
| Woodline Louvers 8x5 | 1130 | 508, 1014 |
| Woodline LED Louvers | 936 | 572, 1019 |
| Woodline Louvers 9.5x6 | 950 | 671, 1002 |
| Woodrick Kitchen | 1058 | 577, 611 |
| Woodrick Shuttering | 943 | N/A |

Server audit after publication: 902/902 prepared page URLs returned image/webp successfully, checked individually with HEAD requests. All 18 Original PDF download URLs returned a valid PDF byte-range response. Local decode validation also verified all 902 WebP files. Generated page payload totals approximately 172.3 MB, with the largest individual page 705,812 bytes.

123 Node tests pass, including source revision invalidation, vendor revocation, private asset protection, image reuse, PDF fallback, rapid navigation and retry. The initial uncached viewer still has setup/network cost; timings above are observed desktop-browser interaction timings, not a promise of identical timing on every device. This was not an exhaustive live visual review of all 902 pages or a physical-device Safari/Android test.
