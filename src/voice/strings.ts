// Textos da voz do carro (N6), em PT e EN: as 8 frases de provocação (decisão nº 24 do dono: só brincadeira, sem palavrão),
// a roda de escolha e o botão de silenciar. tests/i18n.test.ts exige os dois idiomas completos.
import { registerStrings } from '../i18n';

registerStrings('voice', {
  pt: {
    'taunt.0': 'Come poeira!',
    'taunt.1': 'Tchau, tartaruga!',
    'taunt.2': 'Segura essa!',
    'taunt.3': 'Tá devagar, hein?',
    'taunt.4': 'Boa tentativa!',
    'taunt.5': 'Vem pegar!',
    'taunt.6': 'Olha o retrovisor!',
    'taunt.7': 'Bom jogo!',

    'wheel.title': 'Provocar',
    'wheel.hint': 'Marcha ▲ ▼ escolhe · solte a buzina para falar',
    'wheel.wait': 'Aguarde {s} s para falar de novo',
    'wheel.label': 'Roda de frases de {name}',
    'balloon.label': '{name} diz: {text}',

    'mute.on': 'Silenciar',
    'mute.off': 'Ouvir',
    'mute.title': 'Silenciar a buzina e as frases de {name} neste computador',
    'mute.titleOff': 'Voltar a ouvir a buzina e as frases de {name}',
  },
  en: {
    'taunt.0': 'Eat my dust!',
    'taunt.1': 'Bye, turtle!',
    'taunt.2': 'Hold this!',
    'taunt.3': 'Slow today, huh?',
    'taunt.4': 'Nice try!',
    'taunt.5': 'Come and get me!',
    'taunt.6': 'Check your mirror!',
    'taunt.7': 'Good game!',

    'wheel.title': 'Taunt',
    'wheel.hint': 'Gear ▲ ▼ picks · release the horn to say it',
    'wheel.wait': 'Wait {s} s to talk again',
    'wheel.label': '{name}’s phrase wheel',
    'balloon.label': '{name} says: {text}',

    'mute.on': 'Mute',
    'mute.off': 'Unmute',
    'mute.title': 'Mute {name}’s horn and phrases on this computer',
    'mute.titleOff': 'Hear {name}’s horn and phrases again',
  },
});
