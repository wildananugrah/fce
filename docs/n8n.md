```sh

### request jobId
POST {{host}}/webhook/brand-brain
Authorization: Header {{header-key}}

{
    "url":"https://www.bcalife.co.id",
    "language":"indonesian"
}

### response

{
    jobId: "uuid-v4"
}

### check job status
GET {{host}}/webhook/brand-brain/status?jobId=[uuid-v4]
Authorization: Header {{header-key}}

### response DONE
{
    status: "DONE",
    {
        "data":{"name":"BCA Life","category":"Asuransi Jiwa","summary":"BCA Life adalah perusahaan asuransi jiwa terkemuka di Indonesia yang merupakan anak usaha dari Grup BCA. Perusahaan ini menyediakan berbagai produk perlindungan jiwa dan kesehatan, baik untuk individu maupun korporasi. Misi BCA Life adalah memberikan perlindungan finansial yang andal bagi nasabah di setiap tahapan kehidupan mereka.","brandPromise":"Satu-Satunya Asuransi Jiwa Anak Usaha Grup BCA — memberikan perlindungan terpercaya yang didukung oleh kekuatan dan reputasi Grup BCA.","usp":"BCA Life adalah satu-satunya perusahaan asuransi jiwa yang merupakan anak usaha langsung dari Grup BCA, memberikan keunggulan kepercayaan, jaringan luas, dan kemudahan akses bagi nasabah BCA. Produk mencakup proteksi individu dan kumpulan (korporasi) dengan layanan klaim yang terstruktur dan jaringan rumah sakit yang luas.","personality":"Mitra Terpercaya dan Pelindung Keluarga — hadir dengan ketenangan, keandalan, dan kepedulian di setiap tahapan kehidupan nasabah.","tone":"Terpercaya, Hangat, Profesional, dan Menenangkan","targetAudience":"Individu Indonesia dari berbagai tahapan kehidupan — mulai dari masa lajang, pasangan muda, keluarga yang sedang berkembang, hingga mereka yang mendekati masa pensiun. Mereka adalah nasabah BCA yang menginginkan perlindungan jiwa dan kesehatan yang mudah diakses, terpercaya, dan didukung oleh institusi keuangan besar. Kekhawatiran utama mereka meliputi risiko finansial akibat sakit, kecelakaan, atau kematian yang dapat berdampak pada keluarga.","values":["Kepercayaan dan Integritas","Perlindungan Keluarga","Kemudahan Akses Layanan","Transparansi dan Tata Kelola yang Baik","Keberlanjutan dan Tanggung Jawab Sosial","Inovasi Produk yang Relevan"],"contentPillars":["Edukasi Asuransi Jiwa dan Kesehatan","Perencanaan Keuangan di Setiap Tahapan Kehidupan","Produk dan Promo Terbaru BCA Life","Tips Perlindungan Keluarga dan Gaya Hidup Sehat","Kemudahan Klaim dan Layanan Nasabah","Keberlanjutan dan Aktivitas Perusahaan"],"marketingStrategy":"BCA Life mengandalkan kekuatan ekosistem Grup BCA sebagai keunggulan utama dalam menjangkau nasabah yang sudah memiliki kepercayaan terhadap merek BCA. Strategi pemasaran berfokus pada pendekatan omnichannel — melalui platform digital (website, media sosial, dan pembelian online), serta jaringan bancassurance BCA. Konten diarahkan untuk mengedukasi masyarakat tentang pentingnya asuransi jiwa di setiap tahapan kehidupan, dengan pendekatan yang empatik dan relevan secara personal.","dos":["Gunakan bahasa yang hangat, empatik, dan mudah dipahami oleh masyarakat umum","Tonjolkan kepercayaan dan kekuatan Grup BCA sebagai fondasi utama brand","Sesuaikan pesan dengan tahapan kehidupan audiens (lajang, berkeluarga, pensiun)","Sertakan informasi yang edukatif tentang manfaat dan pentingnya perlindungan jiwa","Tampilkan kemudahan proses klaim dan layanan nasabah sebagai bukti komitmen","Gunakan visual yang hangat, positif, dan mencerminkan kehidupan keluarga Indonesia"],"donts":["Hindari penggunaan bahasa yang menakut-nakuti atau mengeksploitasi rasa takut akan kematian dan penyakit","Jangan menggunakan istilah teknis asuransi yang rumit tanpa penjelasan yang memadai","Hindari nada yang terlalu formal dan kaku sehingga terasa jauh dari nasabah","Jangan membuat klaim berlebihan atau janji yang tidak dapat dibuktikan","Hindari konten yang tidak relevan dengan kebutuhan perlindungan dan perencanaan keuangan","Jangan mengabaikan aspek transparansi dalam komunikasi produk dan layanan"],"vocabulary":{"preferred":["Perlindungan","Ketenangan pikiran","Masa depan yang terjamin","Keluarga terlindungi","Terpercaya","Solusi proteksi","Manfaat","Tahapan kehidupan","Amanah","Kemudahan","Nasabah","Andal"],"avoided":["Kematian (tanpa konteks yang tepat)","Risiko mengerikan","Wajib","Murah (kesan meremehkan kualitas)","Garansi mutlak","Rumit","Birokrasi","Susah klaim"]}}
    }
}

### response in progress
{
    status: "IN_PROGRESS"
}

```