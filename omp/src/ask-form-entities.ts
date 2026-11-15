const NAMED_CODE_POINTS =
  'AElig=c6 Aacute=c1 Acirc=c2 Agrave=c0 Aring=c5 Atilde=c3 Auml=c4 Ccedil=c7 ETH=d0 Eacute=c9 Ecirc=ca Egrave=c8 ' +
  'Euml=cb Iacute=cd Icirc=ce Igrave=cc Iuml=cf Ntilde=d1 Oacute=d3 Ocirc=d4 Ograve=d2 Oslash=d8 Otilde=d5 Ouml=d6 ' +
  'THORN=de Uacute=da Ucirc=db Ugrave=d9 Uuml=dc Yacute=dd aacute=e1 acirc=e2 aelig=e6 agrave=e0 aring=e5 atilde=e3 ' +
  'auml=e4 amp=26 apos=27 bull=2022 brvbar=a6 ccedil=e7 cedil=b8 cent=a2 copy=a9 deg=b0 curren=a4 divide=f7 ' +
  'emsp=2003 ensp=2002 euro=20ac eacute=e9 ecirc=ea egrave=e8 eth=f0 euml=eb frac12=bd frac14=bc frac34=be gt=3e ' +
  'iacute=ed icirc=ee iexcl=a1 igrave=ec iquest=bf iuml=ef hellip=2026 laquo=ab ldquo=201c lsquo=2018 lt=3c ' +
  'mdash=2014 macr=af micro=b5 middot=b7 nbsp=a0 ndash=2013 ntilde=f1 oacute=f3 ocirc=f4 ograve=f2 ordf=aa ordm=ba ' +
  'oslash=f8 otilde=f5 ouml=f6 para=b6 pound=a3 plusmn=b1 quot=22 raquo=bb rdquo=201d reg=ae rsquo=2019 sect=a7 ' +
  'shy=ad szlig=df thorn=fe sup1=b9 sup2=b2 sup3=b3 thinsp=2009 times=d7 trade=2122 uacute=fa ucirc=fb ugrave=f9 ' +
  'uml=a8 uuml=fc yacute=fd yuml=ff yen=a5'

const NAMED = new Map(
  NAMED_CODE_POINTS.split(' ').map(pair => {
    const [name, hex] = pair.split('=') as [string, string]

    return [name, String.fromCodePoint(parseInt(hex, 16))]
  }),
)

const ENTITY = /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi
const REPLACEMENT = '�'

/** Decodes the named entities and numeric references omp's HTML reader decodes, and leaves any other `&…;` as written. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text

  return text.replace(ENTITY, (whole, entity: string) => {
    if (entity[0] !== '#') return NAMED.get(entity) ?? NAMED.get(entity.toLowerCase()) ?? whole
    const hex = entity[1]?.toLowerCase() === 'x'
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
    const unusable = !Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)

    return unusable ? REPLACEMENT : String.fromCodePoint(code)
  })
}
