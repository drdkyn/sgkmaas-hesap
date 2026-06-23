# Faz-1 Native Port

Tek motor: `data/workbook.json` (**11 sayfa**, ~52 MB).

## Sayfa budama (2 aşama)

| Aşama | Sayfa | Boyut |
|-------|-------|-------|
| Tam Excel | 68 | ~72 MB |
| 1. budama | 21 | ~61 MB |
| **2. budama (regresyonlu)** | **11** | **~52 MB** |

### Kalan 11 sayfa (zorunlu)
`Hiz. Dökümü`, `Gösterge Tabl.`, `Hizmet`, `Borçln. (TL)`, `Emek. Hes.`, `Emekli Maaşı`, `Emektar 4a (Y)`, `Giriş`, `Bilgi Formu (Y)`, `Veri Girişi`, `Emeklilik Şartları`

### Kaldırılan 9 sayfa (2. aşama — regresyon GEÇTI)
`Statü Tespiti`, `Borçlan.(4b)`, `Borçlan.(GM20)`, `4c Arayüz`, `Borçln.(Dolar)`, `Diğer.San.`, `Mükteza (Y)`, `Em.San.`, `İşten Ayrıl. Bild.`

Detaylı analiz: `data/native/sheet-trim-analysis.json` — `npm run analyze-sheets`

## Admin — dinamik satır ekleme

Yıllık gruplar (TÜFE, GH, PEK, en düşük aylık): **+ Yıl ekle** → `Veri Girişi` satırı + `Emekli Maaşı` H sütunu formülü otomatik okur.

Zam oranı / günlük alt sınır: **+ Satır ekle** → boş satıra yeni dönem.

Veri: `data/params-rows.json` + `data/params.json`

## Komutlar

```bash
npm run trim-workbook
npm run analyze-sheets
npm run regression
```

## Performans

~9 sn / hesap (68 sayfa döneminde ~30 sn).
