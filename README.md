# Cebim — Borç ve Ödeme Takibi

iPhone için kişisel borç, fatura ve maaş takip uygulaması. Uygulama Safari'den **Ana Ekrana Ekle** ile kurulur (PWA). Bu sayede App Store, Mac ya da geliştirici hesabı gerekmez. Tam ekran açılır, internet olmadan da çalışır. Veriler **yalnızca telefonunda** saklanır.

## Neler var?

- **Özet:** Ay sonunda kalacak para (gelir − gider), *şu an elinde olan* (alınan − ödenen), kalan ödemeler, toplam banka borcu
- **Ödenecekler:** Tarihe göre sıralı liste. "Bugün", "3 gün" ve "gecikti" rozetleri var. Ödendi işaretlemek için tek dokunuş yeter.
- **Borçlar:** Banka banka kredi kartı borçları ve kalan kredi taksitleri (kaç taksit kaldı, ne zaman bitiyor)
- **Tekrar eden kalemler:** Maaş, kira, aidat, faturalar bir kere eklenir, her ay kendiliğinden gelir. Taksitli krediler süreleri bitince kaybolur.
- **Aya özel tutar:** Fatura ya da ekstre tutarı her ay değişebilir. Kaleme dokunup o ayın tutarını girersin.
- **Otomatik:** Maaş günü gelince "alındı" sayılır. Talimatlı ödemeler de günü gelince "ödendi" sayılır.
- **Takvime ekle:** Ödemeleri iPhone Takvim'e aktarır ve her ödemeden bir gün önce hatırlatır.
- **Yedek al / geri yükle** (JSON dosyası)
- Karanlık mod, ay değiştirmek için sağa/sola kaydırma

## Hızlı ekleme (yazarak)

Alttaki **+** butonuna bas ve doğal bir şekilde yaz. Enter'a basınca eklenir, sonra hemen bir sonrakini yazabilirsin:

| Yazdığın | Anlaşılan |
|---|---|
| `Maaş 85.000 15` | Gelir, her ayın 15'i |
| `Kira 18.000 5` | Kira, her ayın 5'i |
| `Aidat 2.500 1` | Aidat, her ayın 1'i |
| `Garanti kart 12.500 20` | Garanti BBVA kredi kartı, ayın 20'si |
| `Akbank kredi 4.200 10 18 taksit` | Akbank kredisi, 18 taksit, ayın 10'u |
| `Elektrik 900 25` | Fatura ⚡ |
| `Netflix 229,99 8` | Abonelik |
| `MTV 5.400 15 ocak` | Tek seferlik ödeme, 15 Ocak |

Banka adları (Garanti, İş Bankası, Yapı Kredi, Akbank, Ziraat, QNB, Enpara, VakıfBank, Halkbank, DenizBank, TEB, ING…) ve kart adları (Bonus, Maximum, World, Axess, Paraf…) otomatik tanınır. İstersen şablonlardan seçip formla da ekleyebilirsin.

## iPhone'a kurulum

1. GitHub'da repo **Settings → Pages → Build and deployment → Source: GitHub Actions** seçeneğini seç.
2. `master` dalına push et (ya da Actions sekmesinden iş akışını elle çalıştır). Uygulama `https://<kullanıcı-adı>.github.io/wallet-app-pub/` adresinde yayınlanır.
3. iPhone'da bu adresi **Safari** ile aç → **Paylaş** → **Ana Ekrana Ekle**.

> Not: GitHub Pages, ücretsiz hesaplarda yalnızca herkese açık repolarda çalışır. Kod herkese açık olsa da senin verilerin sadece kendi telefonunda durur.
> Ana ekrandan açılan uygulamanın verilerini iOS silmez. Yine de ara sıra **Ayarlar → Yedek al** ile yedek almanı öneririm.

## Geliştirme

```sh
npm start   # http://localhost:8080
npm test    # ayrıştırıcı ve hesaplama testleri
```

Derleme adımı yok. Uygulama düz HTML, CSS ve JavaScript modüllerinden oluşuyor (`app/`):

- `js/parse.js`: Hızlı ekleme metnini çözümler
- `js/model.js`: Aylık özet, borç ve taksit hesapları, takvim dosyası
- `js/app.js`: Arayüz
- `sw.js`: Çevrimdışı önbellek. Önemli bir değişiklikten sonra `CACHE` sürümünü artır.
