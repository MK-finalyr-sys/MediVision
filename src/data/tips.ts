import type { Tip } from './types'

export const TIPS: Tip[] = [
  {
    id: 'take-with-food', linkedTags: ['take-with-food'], priority: 2,
    en: { title: 'Take it with food', advice: 'This medicine can upset an empty stomach. Take it during or right after a meal, with a full glass of water.' },
    ta: { title: 'உணவுடன் எடுங்கள்', advice: 'வெறும் வயிற்றில் வயிற்றை பாதிக்கலாம். உணவுடன் அல்லது உணவுக்குப் பின் ஒரு கிளாஸ் தண்ணீருடன் எடுங்கள். [TODO: Verify translation]' },
    hi: { title: 'भोजन के साथ लें', advice: 'खाली पेट यह पेट खराब कर सकती है। भोजन के दौरान या तुरंत बाद, एक गिलास पानी के साथ लें। [TODO: Verify translation]' },
  },
  {
    id: 'take-before-food', linkedTags: ['take-before-food'], priority: 2,
    en: { title: 'Take it 15–30 minutes before food', advice: 'This medicine works best before meals. Take it 15–30 minutes before eating, with water.' },
    ta: { title: 'உணவுக்கு 15–30 நிமிடம் முன் எடுங்கள்', advice: 'உணவுக்கு முன் சிறப்பாக செயல்படும். 15–30 நிமிடம் முன் தண்ணீருடன் எடுங்கள். [TODO: Verify translation]' },
    hi: { title: 'खाने से 15–30 मिनट पहले लें', advice: 'भोजन से पहले बेहतर काम करती है। 15–30 मिनट पहले पानी के साथ लें। [TODO: Verify translation]' },
  },
  {
    id: 'before-breakfast', linkedTags: ['before-breakfast'], priority: 2,
    en: { title: 'Morning, empty stomach, before breakfast', advice: 'Take it 30–60 minutes before breakfast with plain water — not with tea, milk or juice. Wait the full time before eating.' },
    ta: { title: 'காலை, வெறும் வயிற்றில், காலை உணவுக்கு முன்', advice: 'காலை உணவுக்கு 30–60 நிமிடம் முன் வெறும் தண்ணீருடன் — தேநீர்/பால் அல்ல. உணவுக்கு முன் முழு நேரம் காத்திருங்கள். [TODO: Verify translation]' },
    hi: { title: 'सुबह, खाली पेट, नाश्ते से पहले', advice: 'नाश्ते से 30–60 मिनट पहले सादे पानी से — चाय, दूध या जूस के साथ नहीं। खाने से पहले पूरा समय रुकें। [TODO: Verify translation]' },
  },
  {
    id: 'avoid-alcohol', linkedTags: ['avoid-alcohol'], priority: 1,
    en: { title: 'Do not drink alcohol with this medicine', advice: 'Alcohol can make side effects worse or cause serious reactions with this medicine. Skip alcohol completely during the course.' },
    ta: { title: 'இந்த மருந்துடன் மது வேண்டாம்', advice: 'மது பக்க விளைவுகளை அதிகரிக்கலாம் அல்லது கடும் பிரதிசெயல் ஏற்படுத்தலாம். சிகிச்சையின் போது மது முற்றிலும் தவிர்க்கவும். [TODO: Verify translation]' },
    hi: { title: 'इस दवा के साथ शराब न लें', advice: 'शराब दुष्प्रभाव बढ़ा सकती है या गंभीर प्रतिक्रिया कर सकती है। कोर्स के दौरान शराब पूरी तरह छोड़ें। [TODO: Verify translation]' },
  },
  {
    id: 'may-cause-drowsiness', linkedTags: ['may-cause-drowsiness'], priority: 2,
    en: { title: 'This medicine can make you sleepy', advice: 'Do not drive or operate machines until you know how it affects you. Take extra care at night.' },
    ta: { title: 'இது தூக்கத்தை ஏற்படுத்தலாம்', advice: 'தாக்கம் தெரியும் வரை வாகனம்/இயந்திரம் ஓட்ட வேண்டாம். இரவில் கூடுதல் கவனம். [TODO: Verify translation]' },
    hi: { title: 'यह दवा नींद ला सकती है', advice: 'जब तक पता न चले कि कैसा असर करती है, गाड़ी/मशीन न चलाएँ। रात में विशेष सावधानी। [TODO: Verify translation]' },
  },
  {
    id: 'may-cause-dizziness', linkedTags: ['may-cause-dizziness'], priority: 2,
    en: { title: 'You may feel dizzy when standing up', advice: 'Get up slowly from sitting or lying down, especially at night. Sit or lie down if you feel dizzy.' },
    ta: { title: 'எழுந்தால் தலைசுற்றலாம்', advice: 'உட்கார்ந்த/படுத்த நிலையிலிருந்து மெதுவாக எழுங்கள், குறிப்பாக இரவில். தலைசுற்றினால் உட்கார்ந்து/படுத்துக்கொள்ளுங்கள். [TODO: Verify translation]' },
    hi: { title: 'उठते समय चक्कर आ सकते हैं', advice: 'बैठने/लेटने से धीरे-धीरे उठें, खासकर रात में। चक्कर लगे तो बैठ/लेट जाएँ। [TODO: Verify translation]' },
  },
  {
    id: 'finish-full-course', linkedTags: ['finish-full-course'], priority: 1,
    en: { title: 'Finish the full course, even if you feel better', advice: 'Stopping early can let the infection return stronger. Finish every dose the doctor prescribed.' },
    ta: { title: 'நலமானாலும் முழு அளவையும் முடிக்கவும்', advice: 'முன்கூட்டி நிறுத்தினால் தொற்று மீண்டும் வலுவாக வரலாம். மருத்துவர் கூறிய ஒவ்வொரு அளவையும் முடிக்கவும். [TODO: Verify translation]' },
    hi: { title: 'अच्छा लगे तो भी पूरा कोर्स पूरा करें', advice: 'जल्दी रोकने से संक्रमण और तेज़ लौट सकता है। डॉक्टर द्वारा बताई हर खुराक पूरी करें। [TODO: Verify translation]' },
  },
  {
    id: 'stay-hydrated', linkedTags: ['stay-hydrated'], priority: 3,
    en: { title: 'Drink plenty of water', advice: 'Keep a bottle of water nearby and sip regularly during the day while on this medicine.' },
    ta: { title: 'போதுமான தண்ணீர் குடிக்கவும்', advice: 'தண்ணீர் குடுவை அருகில் வைத்து பகல் முழுவதும் தொடர்ந்து குடிங்கள். [TODO: Verify translation]' },
    hi: { title: 'खूब पानी पिएँ', advice: 'पास में पानी की बोतल रखें और दिन भर नियमित घूँट लें। [TODO: Verify translation]' },
  },
  {
    id: 'avoid-other-nsaid', linkedTags: ['avoid-other-nsaid'], priority: 1,
    en: { title: 'Do not double painkillers of the same family', advice: 'Ibuprofen, diclofenac and aspirin belong to one family (NSAIDs). Taking two together raises stomach bleeding risk. Check with your pharmacist first.' },
    ta: { title: 'ஒரே வகை வலி மருந்துகளை இரட்டிப்பாக்க வேண்டாம்', advice: 'இப்யூபுரூஃபன், டைக்ளோஃபினாக், ஆஸ்பிரின் ஒரே குடும்பம் (NSAID). இரண்டையும் சேர்த்தால் ரத்தப்போக்கு ஆபத்து. முதலில் மருந்தாளரை கேளுங்கள். [TODO: Verify translation]' },
    hi: { title: 'एक ही परिवार की दर्द निवारक दवाएँ दोगुनी न करें', advice: 'इबूप्रोफेन, डाइक्लोफिनैक और एस्पिरिन एक ही परिवार (NSAID) हैं। दो साथ लेने से पेट के रक्तस्राव का खतरा। पहले फार्मासिस्ट से पूछें। [TODO: Verify translation]' },
  },
  {
    id: 'monitor-blood-sugar', linkedTags: ['monitor-blood-sugar'], priority: 2,
    en: { title: 'Check your blood sugar regularly', advice: 'Keep your glucose meter handy, note readings, and share them at your next doctor visit.' },
    ta: { title: 'இரத்த சர்க்கரையை தொடர்ந்து சோதிக்கவும்', advice: 'க்ளுக்கோமீட்டர் அருகில் வைத்து, படிவுகளை எழுதி, அடுத்த மருத்துவர் வருகையில் காட்டுங்கள். [TODO: Verify translation]' },
    hi: { title: 'अपनी शुगर नियमित जाँचें', advice: 'ग्लूकोमीटर पास रखें, रीडिंग नोट करें, और अगली डॉक्टर विज़िट पर दिखाएँ। [TODO: Verify translation]' },
  },
  {
    id: 'avoid-calcium-iron', linkedTags: ['avoid-calcium-iron'], priority: 2,
    en: { title: 'Keep a gap from calcium, iron and antacids', advice: 'These can block absorption of this medicine. Keep at least a 4-hour gap between them and this tablet.' },
    ta: { title: 'கால்சியம், இரும்பு, ஆன்டாசிட்டிலிருந்து இடைவெளி', advice: 'இவை உறிஞ்சுதலை தடுக்கலாம். இவற்றிற்கும் இந்த மாத்திரைக்கும் குறைந்தது 4 மணி நேரம் இடைவெளி. [TODO: Verify translation]' },
    hi: { title: 'कैल्शियम, आयरन और एंटासिड से अंतर रखें', advice: 'ये अवशोषण रोक सकते हैं। इनके और इस गोली के बीच कम से कम 4 घंटे का अंतर रखें। [TODO: Verify translation]' },
  },
  {
    id: 'do-not-stop-suddenly', linkedTags: ['do-not-stop-suddenly'], priority: 1,
    en: { title: 'Do not stop this medicine suddenly', advice: 'Stopping on your own can make your condition worse. If you want to stop, ask your doctor how to taper safely.' },
    ta: { title: 'திடீரென நிறுத்த வேண்டாம்', advice: 'தாங்களே நிறுத்தினால் நிலை மோசமாகலாம். நிறுத்த விரும்பினால் மருத்துவரிடம் பாதுகாப்பான முறை கேளுங்கள். [TODO: Verify translation]' },
    hi: { title: 'यह दवा अचानक न रोकें', advice: 'खुद रोकने से स्थिति बिगड़ सकती है। रोकना चाहें तो डॉक्टर से सुरक्षित तरीका पूछें। [TODO: Verify translation]' },
  },
  {
    id: 'pregnancy-caution', linkedTags: ['pregnancy-caution'], priority: 1,
    en: { title: 'Not safe in pregnancy', advice: 'This medicine can harm an unborn baby. If you are pregnant or planning pregnancy, stop and contact your doctor immediately.' },
    ta: { title: 'கர்ப்பத்தில் பாதுகாப்பு இல்லை', advice: 'இது கருவுக்கு தீங்கு விளைவிக்கலாம். கர்ப்பம்/திட்டம் என்றால் நிறுத்தி உடனே மருத்துவரை தொடர்பு கொள்ளுங்கள். [TODO: Verify translation]' },
    hi: { title: 'गर्भावस्था में सुरक्षित नहीं', advice: 'यह गर्भ में शिशु को नुकसान पहुँचा सकती है। गर्भवती/योजना हो तो रोकें और तुरंत डॉक्टर से संपर्क करें। [TODO: Verify translation]' },
  },
  {
    id: 'avoid-dairy', linkedTags: ['avoid-dairy'], priority: 2,
    en: { title: 'Keep a gap from milk and antacids', advice: 'Milk, curd and antacids can block this medicine from working. Keep a 2-hour gap between them and this tablet.' },
    ta: { title: 'பால், ஆன்டாசிட்டிலிருந்து இடைவெளி', advice: 'பால், தயிர், ஆன்டாசிட் மருந்தின் செயலை தடுக்கலாம். இவற்றுக்கும் இந்த மாத்திரைக்கும் 2 மணி நேரம் இடைவெளி. [TODO: Verify translation]' },
    hi: { title: 'दूध और एंटासिड से अंतर रखें', advice: 'दूध, दही और एंटासिड दवा के असर को रोक सकते हैं। इनके और इस गोली के बीच 2 घंटे का अंतर रखें। [TODO: Verify translation]' },
  },
  {
    id: 'dissolve-in-water', linkedTags: ['dissolve-in-water'], priority: 2,
    en: { title: 'Dissolve the full sachet in 1 litre of water', advice: 'Mix the complete sachet in clean drinking water and do not dilute further. The salt-water balance must stay correct.' },
    ta: { title: 'முழு சச்செட்டை 1 லிட்டர் நீரில் கரைக்கவும்', advice: 'முழு சச்செட்டை சுத்தமான குடிநீரில் கரைத்து, மேலும் நீர்த்த வேண்டாம். உப்பு-நீர் சமநிலை சரியாக இருக்க வேண்டும். [TODO: Verify translation]' },
    hi: { title: 'पूरा सैचेट 1 लीटर पानी में घोलें', advice: 'पूरा सैचेट साफ़ पीने के पानी में घोलें और आगे पतला न करें। नमक-पानी का संतुलन ठीक रखें। [TODO: Verify translation]' },
  },
]

export function tipsForTags(tags: string[], limit = 4): Tip[] {
  const scored = TIPS.map((tip) => {
    const hits = tip.linkedTags.filter((t) => tags.includes(t)).length
    return { tip, hits }
  })
    .filter((s) => s.hits > 0)
    .sort((a, b) => a.tip.priority - b.tip.priority || b.hits - a.hits)
  return scored.slice(0, limit).map((s) => s.tip)
}

export function tipOfTheDay(): Tip {
  const day = new Date()
  const dayIndex = Math.floor(day.getTime() / 86400000)
  return TIPS[dayIndex % TIPS.length]
}
