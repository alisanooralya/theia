export const ORBITAL_MAX_FLOOR = 100;
export const ORBITAL_BOSS_INTERVAL = 10;

export const ORBITAL_SIGNAL_MAX = 100;
export const ORBITAL_SIGNAL_START = 100;
export const ORBITAL_SIGNAL_REGEN_MS = 5 * 60 * 1000;

export const ORBITAL_COST_NORMAL = 20;
export const ORBITAL_COST_BOSS = 30;

export const ORBITAL_ENEMY = Object.freeze({
  normalName: 'Void Husk',
  bossName: 'Void Warden',
  base: Object.freeze({
    hp: 120,
    atk: 10,
    def: 4,
    critRate: 0.25,
    critDmg: 1.5,
  }),
  perFloor: Object.freeze({ hp: 0.1, atk: 0.06, def: 0.05 }),
  bossMult: Object.freeze({ hp: 2.2, atk: 1.6, def: 1.5 }),
  bossSkill: Object.freeze({
    active: Object.freeze({
      name: 'Void Crush',
      multiplier: 1.6,
      flatBonus: 0,
      defIgnore: 0,
      cooldownSec: 6,
      unlocked: true,
      upgraded: false,
    }),
    passives: [],
  }),
});

export const ORBITAL_REWARD_NORMAL = Object.freeze({
  coin: Object.freeze({ min: 50000, max: 80000 }),
  exp: 360,
  cerelia: Object.freeze({ min: 1, max: 4 }),
});

export const ORBITAL_REWARD_BOSS = Object.freeze({
  coinMult: 2,
  expMult: 2,
  cerelia: Object.freeze({ min: 2, max: 5 }),
});

export function isBossFloor(floor) {
  return (
    Number.isInteger(floor) && floor > 0 && floor % ORBITAL_BOSS_INTERVAL === 0
  );
}

export function costForFloor(floor) {
  return isBossFloor(floor) ? ORBITAL_COST_BOSS : ORBITAL_COST_NORMAL;
}

function scale(base, growth, floor) {
  return base * (1 + growth * (floor - 1));
}

export function enemyForFloor(floor) {
  const boss = isBossFloor(floor);
  const { base, perFloor, bossMult } = ORBITAL_ENEMY;
  const mult = boss ? bossMult : { hp: 1, atk: 1, def: 1 };
  return {
    id: `orbital_f${floor}`,
    name: `${boss ? ORBITAL_ENEMY.bossName : ORBITAL_ENEMY.normalName} Lt.${floor}`,
    boss,
    behavior: boss ? 'skill_based' : 'basic',
    stats: {
      maxHp: Math.round(scale(base.hp, perFloor.hp, floor) * mult.hp),
      atk: Math.round(scale(base.atk, perFloor.atk, floor) * mult.atk),
      def: Math.round(scale(base.def, perFloor.def, floor) * mult.def),
      critRate: base.critRate,
      critDmg: base.critDmg,
    },
  };
}

export const ORBITAL_RECORDS = Object.freeze(
  [
    {
      floor: 10,
      title: 'Menara yang Menembus Langit',
      content: `Orbital Lift bukanlah bangunan baru.

Catatan kerajaan tertua menyebutnya sebagai *Menara Langit*, sebuah struktur yang telah berdiri bahkan sebelum kalender kerajaan pertama dibuat.

Tidak ada seorang pun yang mengetahui siapa pembangunnya.

Batu-batu penyusunnya tidak berasal dari tambang mana pun yang dikenal manusia. Pada permukaannya terdapat rune kuno yang bahkan penyihir modern tidak mampu menerjemahkannya.

Satu hal yang pasti:

*Orbital Lift dibangun oleh seseorang.*

Dan seseorang itu menginginkan menara ini mencapai langit.`,
    },
    {
      floor: 20,
      title: 'Para Arsitek Langit',
      content: `Dalam sebuah manuskrip yang ditemukan di reruntuhan kerajaan kuno, terdapat sebuah nama:

*The Astral Architects.*

Mereka digambarkan bukan sebagai manusia, melainkan sebagai sekelompok penyihir yang hidup ribuan tahun sebelum peradaban sekarang.

Mereka dipercaya menguasai sihir yang mampu memanipulasi gravitasi, ruang, dan energi bintang.

Namun tidak ada catatan mengenai apa yang terjadi kepada mereka setelah pembangunan Orbital Lift dimulai.

Seolah-olah seluruh kelompok tersebut menghilang bersamaan dengan selesainya lantai pertama.`,
    },
    {
      floor: 30,
      title: 'Batu yang Tidak Pernah Habis',
      content: `Salah satu misteri terbesar Orbital Lift adalah material pembangunnya.

Batu tersebut tidak dapat dihancurkan.

Pedang patah ketika digunakan untuk memotongnya.

Sihir api tidak meninggalkan bekas.

Bahkan sihir penghancur tingkat tinggi hanya menghasilkan cahaya sesaat.

Para peneliti menamainya *Astral Stone.*

Anehnya, Astral Stone terus muncul di lantai-lantai yang lebih tinggi.

Seolah-olah seseorang masih membangun Orbital Lift sampai hari ini.`,
    },
    {
      floor: 40,
      title: 'Mesin dan Sihir',
      content: `Kami menemukan ruangan yang berbeda dari seluruh bagian menara sebelumnya.

Di dalamnya terdapat lingkaran sihir raksasa yang terhubung dengan ribuan mekanisme logam.

Tidak ada penyihir yang mengerti cara kerjanya.

Mesin tersebut tidak menggunakan batu bara, minyak, ataupun mana biasa.

Ia menyerap sesuatu dari udara.

Kami menyebut energi itu *Signal*.

Ketika mesin mulai aktif, seluruh menara bergetar.

Dan untuk pertama kalinya, kami mendengar suara dari lantai yang belum kami capai.`,
    },
    {
      floor: 50,
      title: 'Tujuan Sang Pencipta',
      content: `Sebuah ukiran ditemukan di balik dinding lantai lima puluh.

Tulisan itu akhirnya berhasil diterjemahkan.

*“Kami tidak membangun jalan menuju langit.”*

*“Kami membangun jalan menuju tempat di baliknya.”*

Kalimat tersebut mengubah seluruh teori mengenai Orbital Lift.

Menara ini tidak dibuat untuk mencapai bintang.

*Ia dibuat untuk mencapai sesuatu yang berada di atas dunia.*`,
    },
    {
      floor: 60,
      title: 'Kerajaan yang Hilang',
      content: `Catatan kuno menyebut bahwa para Astral Architects pernah meminta bantuan sebuah kerajaan besar.

Kerajaan tersebut menyediakan prajurit, penyihir, material, dan ribuan pekerja.

Sebagai gantinya, para Architects berjanji akan membuka jalan menuju dunia para dewa.

Namun setelah Orbital Lift selesai dibangun, kerajaan tersebut menghilang.

Tidak ada perang, wabah, jasad.

Hanya sebuah kota kosong yang ditemukan bertahun-tahun kemudian.

Dan semua orang di kota itu menghadap ke arah Orbital Lift ketika mereka menghilang.`,
    },
    {
      floor: 70,
      title: 'Para Penjaga',
      content: `Monster yang menghuni lantai tinggi bukanlah penghuni asli menara.

Mereka adalah *Guardians.*

Beberapa memiliki tubuh yang dibentuk dari batu.

Beberapa menggunakan sihir kuno.

Dan beberapa memiliki lambang yang sama dengan Astral Architects.

Jika para Architects benar-benar menghilang ribuan tahun lalu...

siapa yang masih memberi perintah kepada para penjaga ini?`,
    },
    {
      floor: 80,
      title: 'Sang Arsitek',
      content: `Kami menemukan gambaran pertama mengenai pemimpin para Architects.

Tidak ada nama.

Hanya gelar:

*The First Architect.*

Ia digambarkan membawa tongkat yang dikelilingi cincin cahaya dan berdiri di atas dunia yang berbentuk seperti bola.

Di bawah gambar terdapat sebuah kalimat:

*“Ketika pintu terbuka, sang Arsitek akan kembali.”*

Kami tidak tahu apakah itu ramalan.

Atau peringatan.`,
    },
    {
      floor: 90,
      title: 'Pesan Terakhir',
      content: `Signal tiba-tiba berubah.

Rune-rune di seluruh lantai menyala bersamaan.

Kami berhasil menerjemahkan pesan yang muncul pada salah satu dinding.

*“Konstruksi telah selesai.”*

Tidak ada seorang pun di antara kami yang memahami maksudnya.

Orbital Lift masih terus naik.

Namun jika konstruksinya memang telah selesai...

*siapa yang sedang membangunnya sekarang?*`,
    },
    {
      floor: 100,
      title: 'Pesan Sang Arsitek',
      content: `Di lantai seratus kami menemukan sesuatu yang tidak pernah muncul di lantai sebelumnya.

Sebuah gerbang raksasa.

Di tengahnya terdapat lambang Astral Architects.

Tidak ada mekanisme untuk membukanya.

Tidak ada kunci.

Hanya sebuah tulisan:

*“Hanya mereka yang mencapai tempat ini yang berhak mengetahui alasan kami membangun jalan ini.”*

Di bawahnya terdapat satu nama.

Nama yang tidak pernah muncul dalam catatan mana pun sebelumnya.

*THE FIRST ARCHITECT*

Dan untuk pertama kalinya, kami menyadari sesuatu yang jauh lebih mengerikan.

Mungkin para Architects tidak pernah meninggalkan Orbital Lift.

*Mungkin mereka masih berada di atas sana.*`,
    },
  ].map((record) =>
    Object.freeze({
      ...record,
      id: `orbital_record_${String(record.floor).padStart(3, '0')}`,
    })
  )
);

export function recordForFloor(floor) {
  return ORBITAL_RECORDS.find((record) => record.floor === floor) ?? null;
}

export function getOrbitalRecords() {
  return [...ORBITAL_RECORDS];
}
