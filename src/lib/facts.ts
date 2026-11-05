// «¿Sabías que…?» Datos de investigaciones sobre sexualidad, intimidad y cuerpo, con su fuente.
export interface Fact { title: string; text: string; source: string; url?: string }

export const FACTS: Fact[] = [
  {
    title: 'La brecha del orgasmo',
    text: 'En una muestra de más de 52.000 personas adultas, el 86 % de las mujeres lesbianas decía llegar al orgasmo habitualmente, frente al 65 % de las mujeres heterosexuales. Pedir lo que te gusta fue uno de los factores asociados.',
    source: 'Frederick et al., Archives of Sexual Behavior, 2018', url: 'https://doi.org/10.1007/s10508-017-0939-z',
  },
  {
    title: 'Más de 10.000 fibras nerviosas',
    text: 'El primer recuento en tejido humano encontró más de 10.000 fibras nerviosas en el nervio dorsal del clítoris, más de lo que se citaba hasta entonces.',
    source: 'Peters et al., Sexual Medicine Society of North America, 2022',
  },
  {
    title: 'El clítoris es casi todo interno',
    text: 'Lo que se ve es solo la punta: sus cuerpos y bulbos rodean la uretra y la vagina por dentro. Su anatomía completa no se describió con detalle hasta finales de los años 90.',
    source: "O'Connell et al., Journal of Urology, 2005",
  },
  {
    title: 'La penetración no lo es todo',
    text: 'Solo alrededor del 18 % de las mujeres encuestadas dijo que la penetración por sí sola bastaba para llegar al orgasmo. La mayoría necesitaba estimulación del clítoris.',
    source: 'Herbenick et al., Journal of Sex & Marital Therapy, 2018',
  },
  {
    title: 'Una vez por semana basta',
    text: 'En parejas, el bienestar crecía con la frecuencia sexual hasta aproximadamente una vez por semana. Más allá, no se asociaba a más felicidad.',
    source: 'Muise, Schimmack e Impett, Social Psychological and Personality Science, 2016',
  },
  {
    title: 'Cada vez menos sexo',
    text: 'Las personas adultas en EE. UU. tenían relaciones unas 9 veces menos al año a principios de la década de 2010 que a finales de los 90.',
    source: 'Twenge, Sherman y Wells, Archives of Sexual Behavior, 2017',
  },
  {
    title: 'El beso no es universal',
    text: 'El beso romántico-sexual solo aparecía en el 46 % de las 168 culturas estudiadas. En muchas sociedades no forma parte del cortejo.',
    source: 'Jankowiak, Volsche y Garcia, American Anthropologist, 2015',
  },
  {
    title: 'La media real',
    text: 'Con mediciones de más de 15.000 hombres, la longitud media del pene erecto fue de 13,1 cm y en reposo de 9,2 cm. Mucho menos de lo que muestra el porno.',
    source: 'Veale et al., BJU International, 2015',
  },
  {
    title: 'La fantasía más común',
    text: 'En una encuesta a más de 4.000 personas, la fantasía sexual más frecuente fue el sexo en grupo, seguida del BDSM y la novedad o la aventura.',
    source: 'Lehmiller, «Tell Me What You Want», 2018',
  },
  {
    title: 'Hablar de sexo funciona',
    text: 'Un metaanálisis encontró que las parejas que hablan de sexo de forma abierta tienen más satisfacción sexual y también más satisfacción con la relación.',
    source: 'Mallory, Stanton y Handy, Archives of Sexual Behavior, 2019',
  },
  {
    title: 'El deseo no se jubila',
    text: 'El 53 % de las personas de 65 a 74 años y el 26 % de las de 75 a 85 seguían siendo sexualmente activas.',
    source: 'Lindau et al., New England Journal of Medicine, 2007',
  },
  {
    title: 'El misterio del punto G',
    text: 'Una revisión de décadas de estudios concluyó que no hay pruebas anatómicas sólidas de un «punto G» como estructura única, aunque muchas mujeres describen una zona especialmente sensible.',
    source: 'Kilchevsky et al., Journal of Sexual Medicine, 2012',
  },
  {
    title: '¿Cuenta como ejercicio?',
    text: 'En parejas jóvenes, el sexo gastó de media unas 4,2 kcal por minuto en los hombres y 3,1 en las mujeres: un esfuerzo moderado, parecido a caminar rápido.',
    source: 'Frappier et al., PLoS ONE, 2013',
  },
  {
    title: 'Mejor que contar ovejas',
    text: 'Las personas que llegaban al orgasmo con su pareja antes de dormir decían conciliar mejor el sueño y dormir con más calidad.',
    source: 'Lastella et al., Frontiers in Public Health, 2019',
  },
  {
    title: 'Más común de lo que se cree',
    text: 'El 52 % de los hombres de 40 a 70 años tenía algún grado de disfunción eréctil. Es frecuente, tiene tratamiento y conviene hablarlo sin vergüenza.',
    source: 'Feldman et al., Journal of Urology, 1994',
  },
  {
    title: 'Las cuatro fases',
    text: 'Masters y Johnson describieron la respuesta sexual humana en cuatro fases: excitación, meseta, orgasmo y resolución. Hoy se sabe que el deseo no siempre sigue ese orden.',
    source: 'Masters y Johnson, «Human Sexual Response», 1966',
  },
  {
    title: 'Del 0 al 6',
    text: 'La escala Kinsey propuso en 1948 que la orientación no es «una cosa o la otra», sino un continuo del 0 (exclusivamente heterosexual) al 6 (exclusivamente homosexual).',
    source: 'Kinsey et al., «Sexual Behavior in the Human Male», 1948',
  },
  {
    title: 'Un mismo origen',
    text: 'El pene y el clítoris se forman a partir del mismo tejido embrionario, el tubérculo genital. Por eso comparten muchas estructuras y su sensibilidad es comparable.',
    source: 'Langman, «Embriología médica»',
  },
  {
    title: 'Un ecosistema propio',
    text: 'La vagina mantiene un pH ácido (entre 3,8 y 4,5) gracias a los lactobacilos, que la protegen de infecciones. Por eso las duchas vaginales suelen hacer más mal que bien.',
    source: 'Amabebe y Anumba, Frontiers in Medicine, 2018',
  },
  {
    title: 'Lo que más ayuda',
    text: 'Recibir sexo oral, los besos profundos, probar nuevas posturas y pedir lo que se desea se asociaban con orgasmos más frecuentes en las mujeres.',
    source: 'Frederick et al., Archives of Sexual Behavior, 2018', url: 'https://doi.org/10.1007/s10508-017-0939-z',
  },
];
