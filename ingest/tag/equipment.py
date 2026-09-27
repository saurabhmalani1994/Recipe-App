"""Equipment tagger: which kit a recipe's method uses, read from its steps (and ingredient lines
such as "oil for deep-frying"), plus stove_and_oven, one_pot, one_pan and sheet_pan_meal.

The vocabulary is the brief's list (D8 calls it illustrative) plus what the data shows:
steamer, toaster, toaster_oven, ice_cream_maker, bread_machine, waffle_iron, sous_vide,
dehydrator, campfire. Conventions match ingest/tag/gold/score.py:
  - either/or alternatives ("a blender or food processor", "grill or barbecue") are all tagged,
    and also returned as pairs in `alternatives`;
  - pointers, asides and serving notes ("if you want to make this in a slow cooker, visit...",
    "can be reheated in a low oven", "serve with grilled bread") are ignored;
  - UK "grill" (heat the grill, under the grill) is `broiler`; a barbecue is `grill`;
  - "bake" means oven, unless the sentence puts it in a skillet or griddle on the hob with no oven
    temperature ("bake the pancakes in a nonstick skillet"), or the recipe's only baking
    appliance is another one (air fryer, campfire, slow cooker...).
one_pot counts distinct heated vessels on the main path: in "a wok or large frying pan" only the
first counts, and sentences that start "Alternatively" or "If you don't have" add none.
"""
import re

I = re.IGNORECASE

HEAT = ('oven', 'stovetop', 'microwave', 'grill', 'broiler', 'air_fryer', 'slow_cooker',
        'pressure_cooker', 'rice_cooker', 'deep_fryer', 'smoker', 'toaster', 'toaster_oven',
        'sous_vide', 'waffle_iron', 'bread_machine', 'dehydrator', 'campfire', 'steamer')
VOCAB = HEAT + ('food_processor', 'blender', 'immersion_blender', 'mortar_pestle', 'wok',
                'stand_mixer', 'hand_mixer', 'dutch_oven', 'cast_iron', 'sheet_pan', 'spice_grinder',
                'ice_cream_maker', 'no_cook')
# Appliances that bake: a "bake at 170C" in a recipe that uses one of these (and never says
# "oven") is not the oven.
OTHER_BAKERS = ('air_fryer', 'campfire', 'slow_cooker', 'toaster_oven', 'bread_machine', 'pressure_cooker')


def _rx(p):
    return re.compile(p, I)


# Sentences that only point elsewhere, are an aside, or talk about serving.
SKIP_SENT_RE = _rx(
    r'^\s*(?:if you (?:want|would like|\'d like|wish|prefer) to (?:make|cook|do) (?:this|it)\b|'
    r'if you (?:are|\'re) (?:struggling|short|making|cooking ahead)|if making ahead|to make ahead|'
    r'to make (?:this|it) in (?:a|an|the)\b|photograph|recipe via|notes?\s*:|'
    r'(?:serve|serving|goes well|great|delicious|excellent|good|i serve|better for you)\b)|'
    r'\b(?:serve[ds]? (?:it |them |this )?(?:with|over|alongside|on)|see (?:our|the) recipe)\b|'
    r'\bcan be (?:kept|made|frozen|reheated|stored|prepared|cooked ahead)\b|\bwill keep\b')
# Sentences that give an alternative method: their kit is tagged, their vessels do not count.
ALT_SENT_RE = _rx(r'^\s*(?:alternatively|alternative\b|or,? |otherwise|if you (?:do not|don\'?t|dont) have|'
                  r'if using an?\b|you can also)')
# "If you don't have a food processor, ..." -- the named kit is exactly what is NOT used.
DONT_HAVE_RE = _rx(r'\bif you (?:do not|don\'?t|dont) have (?:access to )?(?:an? |the )?[\w -]{0,30}?(?:,|$)')

# ------------------------------------------------------------------ simple term rules
_DUTCH = (r'\b(?:dutch|french) ovens?\b|\bcocotte\b|\b(?:flameproof|lidded|heavy[- ]based|heavy|large|big|'
          r'shallow) casserole(?! dish)\b')
TERMS = [
    ('air_fryer', r'\bair[- ]?fr(?:y|yer|yers|ied|ying)\b|空气炸锅'),
    ('deep_fryer', r'\bdeep[- ]?(?:fat[- ]?)?fryer\b'),
    ('slow_cooker', r'\bslow[- ]?cooker\b|\bcrock[- ]?pot\b|\bcrockpot\b'),
    ('pressure_cooker', r'\bpressure[- ]?cook(?:er|ing|ed)?\b|\binstant ?pot\b|\binstapot\b|'
                        r'\bmulti-?cooker\b|\b(?:natural|quick)[- ]release\b|高压锅|压力锅'),
    ('rice_cooker', r'\brice[- ]cooker\b|电饭煲|电饭锅'),
    ('microwave', r'\bmicrowav\w*\b|微波炉'),
    ('toaster_oven', r'\btoaster[- ]oven\b'),
    ('toaster', r'\btoaster\b(?![- ]oven)'),
    ('wok', r'\bwoks?\b|炒锅'),
    ('dutch_oven', _DUTCH),
    ('cast_iron', r'\bcast[- ]?iron\b|\biron (?:skillet|pan|frying pan)\b'),
    ('sheet_pan', r'\bsheet[- ]?pans?\b|\bbaking (?:sheets?|trays?)\b|\bcookie sheets?\b|'
                  r'\bjelly[- ]?roll pans?\b|\boven trays?\b'),
    ('smoker', r'\bsmoker\b|\bwood chips\b|\bsmoking chips\b'),
    ('spice_grinder', r'\b(?:spice|coffee|electric) (?:grinder|mill)\b'),
    ('mortar_pestle', r'\bpestle\b|\b(?:in|using|with|into) (?:a|the|your) (?:large |small )?mortar\b|'
                      r'\bmortar (?:and|&) pestle\b'),
    ('steamer', r'\bsteamers?\b|\bsteamer basket\b|\bsteaming basket\b|蒸锅|蒸笼'),
    ('ice_cream_maker', r'\bice[- ]cream (?:maker|machine)\b'),
    ('bread_machine', r'\bbread (?:machine|maker)\b'),
    ('waffle_iron', r'\bwaffle (?:iron|maker)\b'),
    ('sous_vide', r'\bsous[- ]?vide\b'),
    ('dehydrator', r'\bdehydrator\b'),
    ('campfire', r'\bcampfire\b|\bbed of (?:hot )?coals\b|\bembers\b|\bfire ?pit\b'),
    ('immersion_blender', r'\b(?:stick|hand|immersion|hand-held|handheld|electric hand) blender\b|'
                          r'\bstick mixer\b|\bbamix\b'),
    ('blender', r'(?<!pastry )(?<!stick )(?<!hand )(?<!immersion )(?<!hand-held )(?<!handheld )'
                r'\bblenders?\b(?! attachment)|\bliquidi[sz]\w*\b|搅拌机|料理机'),
    ('food_processor', r'\bfood[- ]processors?\b|(?<!food )\bprocessor\b|\bmini[- ]?chopper\b|'
                       r'\bmagimix\b|\bcuisinart\b'),
    ('stand_mixer', r'\bstand(?:ing)?[- ]mixer\b|\bfree-?standing mixer\b|\bdough hook\b|'
                    r'\bpaddle(?: attachment| beater)?\b|\bwhisk attachment\b|\bkitchen ?aid\b|'
                    r'\bbowl of (?:a|an|the|your) (?:electric |stand )?mixer\b'),
    ('hand_mixer', r'\bhand[- ]?(?:held )?mixer\b|\belectric (?:hand )?(?:mixer|whisk|beaters?)\b|'
                   r'\bbeaters\b'),
]
TERMS = [(k, _rx(p)) for k, p in TERMS]

GENERIC_MIXER_RE = _rx(r'\b(?:with|using|in) (?:an? |the |your )?(?:electric )?mixer\b|\bmixer (?:on|at) '
                       r'(?:low|medium|high|med)|\bwith the mixer\b|\bmixer running\b')
UNNAMED_FP_RE = _rx(r'\b(?:blitz\w*|whizz?\w*|pulse)\b')
UNNAMED_BLEND_RE = _rx(r'^\s*(?:then\s+)?blend\b(?!\s+in\b)(?!ed)(?![^.]*\b(?:together|thoroughly|well|by hand|'
                       r'spoon|fork|whisk|blended)\b)|\bblend (?:until smooth|on high|on low|to a|again)\b')
CASSEROLE_POT_RE = _rx(r'\bcasserole\b(?! dish)')

# ------------------------------------------------------------------ oven / stovetop / grill
OVEN_WORD_RE = _rx(r'(?<!dutch )(?<!french )(?<!microwave )(?<!toaster )(?<!toaster-)\bovens?\b'
                   r'(?![- ]?(?:mitts?|gloves?|safe|proof))|\bgas mark\b|\bgas \d\b|'
                   r'\d\s*°?\s*c(?:elsius)?\s*/\s*\d+\s*°?\s*c?\s*fan|烤箱')
OVEN_FROM_ONLY_RE = _rx(r'\b(?:remove|take|lift|transfer)\w*[^.]{0,30}\b(?:from|out of) the oven\b')
KEEP_WARM_RE = _rx(r'\bkeep(?:ing)? (?:\w+ )?(?:warm|hot)\b|\bwarm (?:the )?plates\b|\bto keep things warm\b|'
                   r'\blow(?:est)? (?:oven|setting)\b')
BAKE_RE = _rx(r'\b(?:bak(?:e|es|ing)|roast(?:s|ing)?|broast)\b(?!\s+(?:soda|powder|sheets?|trays?|dish|'
              r'dishes|pans?|tins?|paper|parchment|mats?|beans|chocolate|stones?|spray|potato(?:es)?|goods|'
              r'mix|cups?|rack))|\b(?:baked|roasted) (?:for|until|at|in|on|uncovered|covered)\b')
TEMP_RE = _rx(r'\b[1-5]\d\d\s*(?:°|º|degrees?|deg\.?)\s*(?:f(?:ahrenheit)?\b)?|\b[1-5]\d\d\s*f\b|'
              r'\b(?:1\d\d|2[0-4]\d)\s*°?\s*c\b')
NOT_OVEN_TEMP_RE = _rx(r'\boil\b|\bfry|\bair[- ]?fr|\bsyrup|\bthermometer|\bsugar|\bcandy|\binternal|'
                       r'\breach|\bregist|\bprobe|\bsmoker|\bgrill|\bslow cooker|\bwater\b|\bdeep')
STOVE_BAKE_RE = _rx(r'\b(?:skillet|frying pan|fry pan|griddle|non-?stick pan)\b')
STOVE_CUE_RE = _rx(r'\bover (?:a )?(?:very )?(?:low|medium|high|medium-high|medium-low|med|moderate|gentle|'
                   r'high)?[- ]?(?:low|high|medium)?\s*(?:heat|flame)\b|\bon (?:the )?(?:stove|hob|stovetop)\b|'
                   r'\btop of (?:the )?stove\b|\bburner\b|\bpancakes?\b|\bgriddle\b')
STOVE_VESSEL_RE = _rx(r'\bsauce ?pans?\b|\bskillets?\b|\bfrying[- ]pans?\b|\bfry[- ]?pans?\b|'
                      r'\bsaut[ée] pans?\b|\bstock ?pots?\b|\bsoup pots?\b|\bgriddle\b|\bgrill pan\b|'
                      r'\bgriddle pan\b|\bgrill plate\b')
STOVE_ACTION_RE = _rx(
    r'\bhobs?\b|\bstove(?:top|-top)?\b|'
    r'\bburners?\b|\bdouble boiler\b|\bbain[- ]marie\b|\bover (?:a )?(?:very )?(?:low|medium|high|'
    r'medium-high|medium-low|med|moderate|gentle|lowest|highest)[- ]?(?:low|high|medium)?\s*(?:heat|flame)\b|'
    r'\bover (?:the )?heat\b|\bbring (?:it |them |everything |the \w+ |this |to |back )*(?:up )?to (?:a|the) '
    r'(?:rolling |gentle |full |low )?(?:boil|simmer)\b|\bsimmer\w*\b|\bsaut[ée]\w*\b|\bstir[- ]?fr\w*\b|'
    r'\bpan[- ]?fr\w*\b|\bdeep[- ]?fr(?:y|ied|ying)\b|\bshallow[- ]?fr\w*\b|\bsear\w*\b|\bpoach\w*\b|'
    r'\bblanch\w*\b|\bcaramelis\w*|\bcarameliz\w*|\bsteam(?:ed|ing|s)?\b|\bparboil\w*\b|'
    r'\bheat (?:the |some |a little |\d+ ?\w* (?:of )?(?:the )?)?(?:oil|butter|ghee|lard|fat)\b|'
    r'\bmelt (?:the )?(?:butter|margarine|ghee|chocolate)[^.]{0,30}\b(?:in|over) (?:a|the)\b|'
    r'\btoast\w*[^.]{0,40}\b(?:dry )?(?:pan|skillet|frying pan)\b|'
    r'\b(?:hot|heated|preheated) (?:pan|skillet|griddle|wok|frying pan)\b|'
    r'\bcook (?:the )?(?:chicken|beef|bacon|meat|pork|sausages?|ground \w+|rice|pasta|noodles|macaroni|'
    r'spaghetti|potatoes|eggs)\b(?![^.]{0,50}\b(?:oven|microwav|slow cooker|crock|pressure|air fr|rice cooker|'
    r'grill|marinade))|'
    r'锅中|锅里|平底锅|起锅|烧热|大火|中火|小火|烧开|煮沸')
FRY_RE = _rx(r'\bfr(?:y|ies|ied|ying)\b')
FRY_NOT_RE = _rx(r'\bair[- ]?fr|\bdeep[- ]?(?:fat[- ]?)?fryer|\bfried (?:onions|shallots|garlic|bread)\b|'
                 r'\bcrispy fried\b|\bfrench fries\b|\bfries\b|\bthan fried\b')
BOIL_RE = _rx(r'\bboil(?:s|ed|ing)?\b')
BOIL_NOT_RE = _rx(r'\b(?:just|freshly|already)[- ]boiled\b|\bboiled water\b|\bhard[- ]boiled\b|'
                  r'\bsoft[- ]boiled\b|\bkettle\b|\bpour\w*[^.]{0,40}\bboiling\b|\bboiling water over\b|'
                  r'\b(?:dissolved?|stir\w*|add\w*) (?:it )?(?:in|into|with) (?:\d[\d/ ]*\s*\w+ )?(?:of )?'
                  r'(?:the )?(?:boiling|hot) water\b')
PAN_HEAT_RE = _rx(r'\b(?:pans?|pots?)\b[^.]{0,60}\b(?:heat|fry|fried|saut|simmer|boil|melt|toast|sear|'
                  r'brown|bring)\w*|\b(?:heat|fry|saut\w*|simmer|boil|melt|toast|sear|brown|cook)\w*\b'
                  r'[^.]{0,40}\b(?:in|into) (?:a|the|your|same)\b[^.]{0,25}\b(?:pans?|pots?)\b')
PKG_COOK_RE = _rx(r'\bcook\w* (?:the )?(?:pasta|noodles|spaghetti|macaroni|linguine|penne|rice|fettuccine|'
                  r'lasagna|lasagne|udon|soba)\b[^.]{0,40}\baccording to\b|'
                  r'\b(?:pot|pan|saucepan) of (?:salted |well-salted )?boiling (?:salted )?water\b')

GRILL_RE = _rx(r'\bgrill(?:s|ing)?\b(?![- ]?(?:pans?|plates?|marks?|lines)\b)|\bgrilled? (?:for|until|over|on|under)\b')
BBQ_RE = _rx(r'\bbarbe(?:c|qu)ues?\b(?! sauce| seasoning| rub| chips| spice)|\bbbq\b(?! sauce| seasoning| rub)|'
             r'\bcharcoal\b|(?<!bed of )(?<!bed of hot )\bcoals\b|\bthe grates\b|\bgrill grates?\b|'
             r'\bgrill rack\b|\bgas grill\b|\boutdoor grill\b|\bindirect heat\b|\bkettle grill\b')
UK_BROIL_CUE_RE = _rx(r'\bunder (?:a|the) (?:hot |preheated |medium |high |low |very hot )?grill\b|'
                      r'\bgrill (?:to|on) (?:high|medium|low|hot)\b|\btop shelf\b|'
                      r'\b(?:heat|preheat) the grill to\b')
UK_STYLE_RE = _rx(r'\b\d{3}\s*°?\s*C\b|\bgas mark\b|\bgas \d\b|\bfan\b|\bhob\b|\btbsp\b|\bmins\b|'
                  r'\bcourgettes?\b|\baubergines?\b|\bclingfilm\b|\bcling film\b|\bkitchen paper\b')
GRILL_OR_BBQ_RE = _rx(r'\bgrill\s+or\s+(?:on\s+)?(?:the |a )?(?:barbecue|bbq)\b|'
                      r'\b(?:barbecue|bbq)\s+or\s+(?:under\s+)?(?:the |a )?grill\b')
BROIL_RE = _rx(r'\bbroil(?:er|ers|ing|s)?\b|\bsalamander\b')

# ------------------------------------------------------------------ vessels (one_pot)
_POT = [('dutch_oven', _DUTCH),
        ('stockpot', r'\bstock ?pots?\b|\bsoup pots?\b'),
        ('saucepan', r'\bsauce ?pans?\b'),
        ('pot', r'(?<!crock-)(?<!crock )(?<!instant )(?<!instant-)\bpots?\b(?! roast)(?! pie)'),
        ('pan_of_water', r'\bpan of (?:salted |simmering |boiling )*water\b')]
_PAN = [('skillet', r'\bskillets?\b|\bfrying[- ]pans?\b|\bfry[- ]?pans?\b|\bsaut[ée] pans?\b|\bnon-?stick pans?\b'),
        ('wok', r'\bwoks?\b|炒锅'),
        ('griddle', r'\bgriddle(?: pan)?\b|\bgrill pan\b|\bgrill plate\b|\bpancake pan\b'),
        ('pan', r'(?<!sauce )(?<!frying )(?<!fry )(?<!sheet )(?<!roasting )(?<!baking )(?<!cake )'
                r'(?<!loaf )(?<!pie )(?<!muffin )(?<!bundt )(?<!tart )(?<!tube )(?<!springform )(?<!jelly roll )'
                r'(?<!jelly-roll )(?<!grill )(?<!griddle )(?<!sauté )(?<!saute )(?<!pancake )(?<!square )'
                r'(?<!round )\bpans?\b')]
_OVEN = [('dish', r'\b(?:baking|casserole|ovenproof|oven-?proof|gratin|pie|souffl[ée]|roasting|lasagne|'
                  r'lasagna|pyrex) dish(?:es)?\b|\broasting (?:tins?|pans?|trays?)\b|\bbaking (?:pans?|tins?)\b|'
                  r'\b(?:loaf|cake|pie|tart|muffin|bundt|tube|springform|brownie|sandwich|square|round|flan|'
                  r'traybake) (?:tins?|pans?|plates?|molds?|moulds?)\b|\bspringform\b|\b\d+\s*(?:x|by)\s*\d+'
                  r'(?:\s*-?\s*(?:inch|in\.?|cm))?\s*(?:baking )?(?:pans?|dish|tins?)\b|\bramekins?\b|'
                  r'\bpie (?:shell|crust)\b|\bcasserole\b|\bpastry-lined\b'),
         ('sheet', r'\bsheet[- ]?pans?\b|\bbaking (?:sheets?|trays?)\b|\bcookie sheets?\b|'
                   r'\bjelly[- ]?roll pans?\b|\boven trays?\b'),
         ('dish_weak', r'\b(?:shallow |large |small |medium |glass |deep )?dish\b')]
_APPL = [('slow_cooker', TERMS[2][1]), ('pressure_cooker', TERMS[3][1]), ('rice_cooker', TERMS[4][1]),
         ('air_fryer', TERMS[0][1]), ('deep_fryer', TERMS[1][1]), ('microwave', TERMS[5][1]),
         ('campfire', dict(TERMS)['campfire']), ('waffle_iron', dict(TERMS)['waffle_iron']),
         ('bread_machine', dict(TERMS)['bread_machine']), ('smoker', dict(TERMS)['smoker']),
         ('toaster', dict(TERMS)['toaster']), ('sous_vide', dict(TERMS)['sous_vide']),
         ('steamer_appl', dict(TERMS)['steamer'])]
_V = ([(k, _rx(p), 'pot') for k, p in _POT] + [(k, _rx(p), 'pan') for k, p in _PAN] +
      [(k, _rx(p), 'oven') for k, p in _OVEN])
HEAT_CUE_RE = _rx(r'\bheat|\bfry|\bfried|\bsaut|\bsimmer|\bboil|\bmelt|\btoast|\bsear|\bbrown|\bbring|\bcook|'
                  r'\bbake|\broast|\bsteam|\bpoach|\bwarm|\breduce|\bstir[- ]?fr|\bover (?:a )?\w*[- ]?\w* heat|'
                  r'\boven\b|°')
HEATPROOF_OVER_RE = _rx(r'\b(?:heatproof|heat-proof) bowl\b[^.]{0,60}\bover\b|\bbowl (?:set )?over (?:a )?'
                        r'(?:pan|pot|saucepan) of (?:barely )?simmering\b')
GUIDE_RE = _rx(r'\bas a guide\b|\bto trace\b|\btemplate\b|\bweigh(?:t)? (?:it|them) down\b')
OR_BETWEEN_RE = _rx(r'\bor\b(?!\s+(?:until|till|so|more|less|longer|as|when|to taste|a little|about))')
CJK_OVEN = _rx(r'烤箱|烤盘')


def _sentences(raw):
    out = []
    for step in raw.get('steps') or []:
        if not step:
            continue
        for s in re.split(r'(?<=[.!?。！？])\s*|\n+', step):
            s = s.strip()
            if s:
                out.append(s)
    return out


def steps_status(raw):
    """'ok', 'no_steps' or 'too_short' (truncated or placeholder steps)."""
    steps = [s for s in (raw.get('steps') or []) if s and s.strip() and s.strip() not in ('>', '.')]
    if not steps:
        return 'no_steps'
    text = ' '.join(steps)
    words = re.findall(r'\w+', text)
    if len(words) < 8 and not re.search(r'[一-鿿]', text):
        return 'too_short'
    return 'ok'


def _find_terms(sent):
    hits = []
    for key, rx in TERMS:
        for m in rx.finditer(sent):
            hits.append((m.start(), m.end(), key))
    return hits


def _alt_groups(sent, hits):
    groups = []
    hits = sorted(hits)
    for (s1, e1, k1), (s2, e2, k2) in zip(hits, hits[1:]):
        between = sent[e1:s2]
        if k1 != k2 and re.fullmatch(r'\s*(?:,\s*)?(?:or|/)\s*(?:a |an |the |use a |use an |using a |a small |'
                                     r'a large |your )?(?:small |large |mini )?', between, I):
            groups.append(tuple(sorted((k1, k2))))
    return groups


def _grill_kind(sent, uk, bbq_any):
    """'broiler', 'grill' or None for a sentence that names a grill."""
    if not GRILL_RE.search(sent):
        return None
    if UK_BROIL_CUE_RE.search(sent):
        return 'broiler'
    if uk and GRILL_OR_BBQ_RE.search(sent):
        return 'broiler'  # "heat the grill or barbecue": the grill is the one indoors
    if BBQ_RE.search(sent):
        return 'grill'
    if uk and not bbq_any:
        return 'broiler'
    return 'grill'


def _is_oven_bake(sent, other_baker_only):
    """Does this sentence's bake/roast/temperature mean the oven?"""
    if BAKE_RE.search(sent):
        if (STOVE_BAKE_RE.search(sent) and STOVE_CUE_RE.search(sent) and not TEMP_RE.search(sent)
                and not OVEN_WORD_RE.search(sent)):
            return False  # stovetop bake
        if re.search(r'\b(?:dry[- ]roast|pan[- ]roast|roast\w* (?:the )?(?:spices|seeds|nuts|cumin|coriander|'
                     r'sesame|peppercorns)[^.]{0,30}\b(?:pan|skillet)|roast\w*[^.]{0,30}\b(?:in a|in the) '
                     r'(?:dry )?(?:pan|skillet|frying pan|wok)|over (?:an? )?(?:open )?flame|gas flame)', sent, I):
            return False
        if re.search(r'\bair[- ]?fr|\bslow cooker|\bgrill|\bbarbecue|\bcoals|\bcampfire|\bmicrowav|\btoaster',
                     sent, I) and not OVEN_WORD_RE.search(sent):
            return False
        return not other_baker_only
    if TEMP_RE.search(sent) and not NOT_OVEN_TEMP_RE.search(sent):
        return not other_baker_only
    return False


def _stove_bake(sent):
    return bool(BAKE_RE.search(sent) and STOVE_BAKE_RE.search(sent) and STOVE_CUE_RE.search(sent)
                and not TEMP_RE.search(sent) and not OVEN_WORD_RE.search(sent))


def tag_equipment(raw, items=None):
    """Returns dict: equipment (sorted list), alternatives, stove_and_oven, one_pot, one_pan,
    sheet_pan_meal, vessels, status ('ok' | 'no_steps' | 'too_short')."""
    status = steps_status(raw)
    found = set()
    groups = []
    sents = _sentences(raw)
    oven_sents = []
    if status != 'no_steps':
        full = ' '.join(sents)
        uk = raw.get('source') == 'bbcgoodfood' or bool(UK_STYLE_RE.search(full))
        bbq_any = bool(BBQ_RE.search(full))
        kept = []
        for sent in sents:
            if SKIP_SENT_RE.search(sent):
                continue
            sent = DONT_HAVE_RE.sub(' ', sent)
            kept.append(sent)
            hits = _find_terms(sent)
            found |= {k for _, _, k in hits}
            groups += _alt_groups(sent, hits)
            if CASSEROLE_POT_RE.search(sent) and (STOVE_ACTION_RE.search(sent) or
                                                   re.search(r'\bcook over\b|\bhigh heat\b', sent, I)):
                found.add('dutch_oven')
        found_early = set(found)
        other_baker_only = bool(found_early & set(OTHER_BAKERS)) and not OVEN_WORD_RE.search(full)
        for sent in kept:
            # oven
            if OVEN_WORD_RE.search(sent) and not (OVEN_FROM_ONLY_RE.search(sent) and
                                                  len(OVEN_WORD_RE.findall(sent)) == 1 and
                                                  not BAKE_RE.search(sent)):
                oven_sents.append(sent)
            elif _is_oven_bake(sent, other_baker_only) or CJK_OVEN.search(sent):
                oven_sents.append(sent)
            # stovetop
            microwave_sent = bool(re.search(r'\bmicrowav', sent, I))
            if _stove_bake(sent) or STOVE_ACTION_RE.search(sent):
                found.add('stovetop')
            if STOVE_VESSEL_RE.search(sent) and not (BAKE_RE.search(sent) or OVEN_WORD_RE.search(sent)
                                                     or TEMP_RE.search(sent)):
                found.add('stovetop')
            if FRY_RE.search(sent) and not FRY_NOT_RE.search(sent) and not re.search(r'\bair', sent, I):
                found.add('stovetop')
            if BOIL_RE.search(sent) and not BOIL_NOT_RE.search(sent) and not microwave_sent:
                found.add('stovetop')
            if (PAN_HEAT_RE.search(sent) and not microwave_sent) or PKG_COOK_RE.search(sent):
                found.add('stovetop')
            # grill / broiler
            if BROIL_RE.search(sent):
                found.add('broiler')
            if BBQ_RE.search(sent):
                found.add('grill')
            gk = _grill_kind(sent, uk, bbq_any)
            if gk:
                found.add(gk)
        if oven_sents:
            found.add('oven')
        # unnamed devices
        if not found & {'blender', 'food_processor', 'immersion_blender', 'spice_grinder', 'mortar_pestle'}:
            for sent in kept:
                if UNNAMED_FP_RE.search(sent):
                    found.add('food_processor')
                    break
                if UNNAMED_BLEND_RE.search(sent):
                    found.add('blender')
                    break
        if 'stand_mixer' not in found and 'hand_mixer' not in found:
            if any(GENERIC_MIXER_RE.search(s) for s in kept):
                found.add('hand_mixer')
        for line in raw.get('ingredients') or []:
            if re.search(r'\bfor (?:deep[- ]?|shallow[- ]?)?fr(?:y|ying)\b', line or '', I):
                found.add('stovetop')
    heat = found & set(HEAT)
    if status == 'ok' and not heat:
        found.add('no_cook')
    groups = sorted(set(groups))
    vessels = None
    one_pot = one_pan = sheet_meal = None
    if status == 'ok':
        vessels = _vessels(raw, sents, found, oven_sents)
        if 'no_cook' in found:
            one_pot = one_pan = sheet_meal = False
        else:
            one_pot = len(vessels) == 1
            fam = vessels[0][1] if one_pot else None
            one_pan = bool(one_pot and fam in ('pan', 'oven'))
            sheet_meal = bool(one_pot and vessels[0][0] == 'sheet' and 'oven' in found
                              and _is_meal(items or []))
    return {
        'equipment': sorted(found),
        'alternatives': [list(g) for g in groups],
        'stove_and_oven': 'stovetop' in found and 'oven' in found,
        'one_pot': one_pot,
        'one_pan': one_pan,
        'sheet_pan_meal': sheet_meal,
        'vessels': [v[0] for v in vessels] if vessels is not None else None,
        'status': status,
    }


BAKING_SLUGS = {'all_purpose_flour', 'flour', 'self_raising_flour', 'bread_flour', 'cake_flour',
                'baking_powder', 'baking_soda', 'yeast', 'instant_yeast', 'active_dry_yeast',
                'fresh_yeast', 'cake_mix', 'plain_flour'}


def _is_meal(items):
    from ingest.taxonomy import taxonomy as T
    ing = T.load()
    slugs = [it.get('slug') for it in items if it.get('slug')]
    if any(s in BAKING_SLUGS for s in slugs):
        return False
    cats = [ing.get(s, {}).get('category') for s in slugs]
    return 'protein' in cats or sum(1 for c in cats if c == 'vegetable') >= 2


def _vessels(raw, sents, found, oven_sents):
    """Distinct heated cooking vessels on the main path: sorted [(kind, family)]."""
    kinds = {}
    alt_hob = False
    uses_oven = bool(found & {'oven', 'broiler', 'toaster_oven'})
    pan_in_oven = False
    full = ' '.join(sents)
    uk = raw.get('source') == 'bbcgoodfood' or bool(UK_STYLE_RE.search(full))
    bbq_any = bool(BBQ_RE.search(full))
    kept = [DONT_HAVE_RE.sub(' ', s) for s in sents if not SKIP_SENT_RE.search(s)]
    for n, sent in enumerate(kept):
        if ALT_SENT_RE.search(sent) or GUIDE_RE.search(sent):
            continue
        nxt = kept[n + 1] if n + 1 < len(kept) else ''
        heat_cue = bool(HEAT_CUE_RE.search(sent))
        microwave_sent = bool(re.search(r'\bmicrowav', sent, I))
        mentions = []   # (start, end, kind, family)
        spans = []
        for kind, rx, fam in _V:
            for m in rx.finditer(sent):
                if any(s <= m.start() < e for s, e in spans):
                    continue
                spans.append((m.start(), m.end()))
                if fam == 'oven' and not uses_oven:
                    continue
                if kind in ('pan', 'pot') and not (heat_cue or HEAT_CUE_RE.search(nxt)):
                    continue
                if kind == 'dish_weak' and not heat_cue:
                    continue
                if kind == 'pot' and microwave_sent:
                    continue
                if kind == 'dish' and CASSEROLE_POT_RE.search(m.group(0)) and 'dutch_oven' in found \
                        and not BAKE_RE.search(sent):
                    kind, fam = 'dutch_oven', 'pot'
                mentions.append((m.start(), m.end(), kind, fam))
        for kind, rx in _APPL:
            for m in rx.finditer(sent):
                k = 'steamer' if kind == 'steamer_appl' else kind
                mentions.append((m.start(), m.end(), k, 'appliance' if k != 'steamer' else 'pot'))
        for m in BBQ_RE.finditer(sent):
            mentions.append((m.start(), m.end(), 'grill', 'appliance'))
        gk = _grill_kind(sent, uk, bbq_any)
        if gk:
            for m in GRILL_RE.finditer(sent):
                mentions.append((m.start(), m.end(), 'grill' if gk == 'grill' else 'broiler_tray',
                                 'appliance' if gk == 'grill' else 'oven'))
        for m in BROIL_RE.finditer(sent):
            mentions.append((m.start(), m.end(), 'broiler_tray', 'oven'))
        mentions.sort()
        keep = []
        for mm in mentions:
            if keep:
                prev = keep[-1]
                between = sent[prev[1]:mm[0]]
                if prev[2] != mm[2] and len(between) <= 60 and OR_BETWEEN_RE.search(between):
                    if mm[3] in ('pot', 'pan'):
                        alt_hob = True
                    continue  # "a wok or large frying pan": the second is an alternative
            keep.append(mm)
        for s, e, kind, fam in keep:
            kinds.setdefault(kind, fam)
            if fam == 'pan' and (OVEN_WORD_RE.search(sent) or BAKE_RE.search(sent)):
                pan_in_oven = True
        if HEATPROOF_OVER_RE.search(sent):
            kinds['heatproof_bowl'] = 'pot'
        if PKG_COOK_RE.search(sent):
            kinds['pasta_pot'] = 'pot'
    # merge generic words into a specific one of the same family
    if 'pan' in kinds:
        if any(k in kinds for k in ('skillet', 'wok', 'griddle')):
            del kinds['pan']
        elif any(k in kinds for k in ('saucepan', 'stockpot', 'dutch_oven', 'pot')):
            del kinds['pan']
        elif any(f == 'oven' for f in kinds.values()) and 'stovetop' not in found:
            del kinds['pan']
    if 'pan_of_water' in kinds and len([k for k in kinds if kinds[k] in ('pot', 'pan')]) > 1:
        del kinds['pan_of_water']
    if 'pot' in kinds and any(k in kinds for k in ('saucepan', 'stockpot', 'dutch_oven')):
        del kinds['pot']
    if 'stockpot' in kinds and 'dutch_oven' in kinds:
        del kinds['stockpot']
    if 'dish_weak' in kinds and any(k in kinds for k in ('dish', 'sheet')):
        del kinds['dish_weak']
    if 'broiler_tray' in kinds and any(k in kinds for k in ('dish', 'sheet', 'dish_weak')):
        del kinds['broiler_tray']
    if 'steamer' in kinds and any(f in ('pot', 'pan') for k, f in kinds.items() if k != 'steamer'):
        del kinds['steamer']
    # a hob with no named hob vessel still uses one
    stove_vessel = any(f in ('pot', 'pan') for k, f in kinds.items() if k != 'heatproof_bowl')
    if 'stovetop' in found and not stove_vessel and not alt_hob:
        kinds['hob_vessel'] = 'pot'
    oven_vessel = any(f == 'oven' for f in kinds.values())
    real_oven = [s for s in oven_sents if not KEEP_WARM_RE.search(s)]
    if 'oven' in found and real_oven and not oven_vessel and not pan_in_oven:
        kinds['oven_vessel'] = 'oven'
    return sorted(kinds.items())
