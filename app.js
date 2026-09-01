'use strict';

/* ============================================================
   Codification du plan d'urbanisme – Ville de Terrebonne
   Prototype front-end (sans serveur), données persistées dans
   le navigateur (localStorage), exportables/importables en JSON.

   La classification des usages (groupes/classes/sous-classes)
   provient du document de référence transmis par le Service de
   l'urbanisme (trame de règlement unifié). Les fiches de zonage
   (normes chiffrées par zone) sont des EXEMPLES : ce document ne
   contient pas l'annexe « B » réelle (fiches propres à Terrebonne).
   ============================================================ */

const STORAGE_KEY = 'terrebonne-urbanisme-data-v2';
const ADMIN_DEMO_PASSWORD = 'urbanisme2026';

const STRUCTURES_AUTORISEES = ['Isolée', 'Jumelé', 'En rangée', 'Projet intégré'];

const AFFECTATIONS = [
  { code: 'C', nom: 'Conservation' },
  { code: 'AG', nom: 'Agricole' },
  { code: 'F', nom: 'Forestière & agroforestière' },
  { code: 'P', nom: 'Périurbaine & périurbaine champêtre' },
  { code: 'U', nom: 'Urbaine' },
  { code: 'M', nom: 'Multifonctionnelle' },
  { code: 'M-TOD', nom: 'Multifonctionnelle – TOD' },
  { code: 'PE', nom: 'Pôle d\'emplois mixtes' },
  { code: 'I', nom: 'Industrielle' },
  { code: 'UC', nom: 'Usages contraignants' },
  { code: 'VM', nom: 'Valorisation des matières résiduelles' },
];

// Structure des sections normatives d'une fiche de zonage, telle que
// décrite dans la section « Lecture des fiches de zonage » du document
// de référence (chaque champ y est prescrit en valeur min. et/ou max.).
const FICHE_SECTIONS = [
  {
    id: 'terrain', titre: 'Terrain', fields: [
      { key: 'superficie', label: 'Superficie (m²)' },
      { key: 'largeur', label: 'Largeur (m)' },
      { key: 'profondeur', label: 'Profondeur (m)' },
    ],
  },
  {
    id: 'logementDensite', titre: 'Logement et densité', fields: [
      { key: 'logementsParBatiment', label: 'Logements par bâtiment' },
      { key: 'logementsParHectare', label: 'Logements par hectare' },
    ],
  },
  {
    id: 'volumetrie', titre: 'Volumétrie et architecture', fields: [
      { key: 'largeurBatiment', label: 'Largeur du bâtiment (m)' },
      { key: 'profondeurBatiment', label: 'Profondeur du bâtiment (m)' },
      { key: 'etages', label: 'Nombre d\'étages' },
      { key: 'hauteur', label: 'Hauteur du bâtiment principal (m)' },
      { key: 'superficieImplantation', label: 'Superficie d\'implantation (m²)' },
    ],
  },
  {
    id: 'implantation', titre: 'Implantation', fields: [
      { key: 'avant', label: 'Avant (m)' },
      { key: 'avantSecondaire', label: 'Avant secondaire (m) — terrain de coin' },
      { key: 'laterale', label: 'Latérale (m)' },
      { key: 'lateraleTotale', label: 'Latérale au total (m)' },
    ],
  },
  {
    id: 'coefficients', titre: 'Coefficients d\'implantation', fields: [
      { key: 'ces', label: 'Coefficient d\'emprise au sol – CES (%)' },
      { key: 'cos', label: 'Coefficient d\'occupation du sol – COS' },
    ],
  },
];

// Classification des usages (groupes → classes → sous-classes), extraite
// du chapitre « Classification des usages » du document de référence.
const CLASSIFICATION = [
  {
    id: 'reseau', nom: 'Usage autorisé sur l\'ensemble du territoire',
    classes: [
      {
        code: 'PP', nom: 'Infrastructure, service d\'utilité publique et service public',
        description: 'Services liés à des infrastructures d\'aqueduc et d\'égout, des équipements de télécommunication, des réseaux de transport et de distribution d\'énergie, des infrastructures routières ainsi que des ouvrages ou équipements favorisant la mobilité des personnes ou le transport de marchandises par une instance gouvernementale ou municipale, ainsi que des services publics. Autorisée dans toutes les zones situées à l\'intérieur du périmètre urbain; les normes de l\'annexe « B » ne s\'appliquent pas à ces usages.',
        usages: ['Infrastructure pour le transport en commun et arrêt d\'autobus', 'Gare, station, stationnement incitatif, débarcadère ou autre sous l\'égide d\'une administration publique', 'Boîte postale', 'Mobilier urbain', 'Antenne d\'utilité publique', 'Monument et site historique', 'Équipement d\'utilité publique', 'Administration publique municipale', 'Protection contre l\'incendie (pompier)', 'Service de police municipale', 'Bibliothèque municipale'],
      },
    ],
  },
  {
    id: 'habitation', nom: 'Habitation',
    classes: [
      { code: 'H1', nom: 'Unifamiliale', description: 'Habitations contenant 1 seul logement principal.' },
      { code: 'H2', nom: 'Faible densité', description: 'Habitations contenant de 2 à 4 logements principaux.' },
      { code: 'H3', nom: 'Densité modérée', description: 'Habitations contenant de 5 à 8 logements principaux.' },
      { code: 'H4', nom: 'Moyenne densité', description: 'Habitations contenant de 9 à 24 logements principaux.' },
      { code: 'H5', nom: 'Forte densité', description: 'Habitations contenant de 25 à 49 logements principaux.' },
      { code: 'H6', nom: 'Très forte densité', description: 'Habitations contenant 50 logements principaux et plus.' },
      {
        code: 'H7', nom: 'Résidence collective',
        description: 'Résidence où sont offerts des chambres ou des logements principaux et une gamme plus ou moins étendue de services communs et d\'aires communes, principalement reliés à la sécurité et à l\'aide à la vie domestique ou sociale.',
        usages: ['Maison de chambres', 'Pension', 'Résidence d\'étudiantes', 'Résidence pour personnes âgées'],
      },
    ],
  },
  {
    id: 'commerce', nom: 'Commerce',
    classes: [
      {
        code: 'C1', nom: 'Commerce et service de proximité',
        description: 'Bâtiments répondant aux besoins locaux, biens ou services satisfaisant les besoins courants des personnes qui résident à proximité, achats en petite quantité et de façon quotidienne. Aucun entreposage extérieur; aucune nuisance perceptible hors terrain.',
        sousClasses: [
          { code: 'C1A', nom: 'Vente de produits alimentaires', usages: ['Épicerie, boucherie, poissonnerie, fruits et légumes', 'Boulangerie et pâtisserie', 'Dépanneur', 'Café'] },
          { code: 'C1B', nom: 'Vente de biens semi-courants', usages: ['Pharmacie', 'Fleuriste, bijouterie', 'Librairie, papeterie', 'Quincaillerie', 'Magasin à rayons et marchandises en général', 'Vêtements, souliers et accessoires', 'Boutique pour animaux de compagnie', 'Articles de sport, jouets et musique', 'Lieu de retour (contenants consignés élargis)'] },
          { code: 'C1C', nom: 'Service professionnel', usages: ['Architecte, ingénieur', 'Arpenteur', 'Urbaniste', 'Notaire, avocat', 'Comptable', 'Graphiste'] },
          { code: 'C1D', nom: 'Service pour animaux domestiques', usages: ['Animalerie', 'Service de garde', 'École de dressage', 'Service de toilettage', 'Service vétérinaire', 'Service d\'hôpital'] },
          { code: 'C1E', nom: 'Service médical', usages: ['Clinique médicale et dentaire', 'Laboratoire médical et dentaire', 'Podiatrie, orthopédie', 'Physiothérapie, ergothérapie', 'Orthophonie, audiologie', 'Optométrie et bureau d\'optique', 'Santé mentale (psychiatre, psychologue, etc.)'] },
          { code: 'C1F', nom: 'Service personnel', usages: ['Service de poste, comptoir d\'envois et de réception', 'Lieu de retour des contenants consignés', 'Espace de coworking', 'Salon d\'esthétique et de coiffure', 'Cordonnerie et couture', 'Agence de voyages', 'Bureau administratif, secrétariat, traduction', 'Buanderie, nettoyage à sec', 'Photographie et encadrement', 'Publicité et informatique', 'Réparation de biens/équipements/appareils', 'Salon funéraire'] },
          { code: 'C1G', nom: 'Service financier', usages: ['Banque et service bancaire', 'Service d\'assurance et de placement'] },
          { code: 'C1H', nom: 'Restauration', usages: ['Restauration avec service complet ou restreint', 'Restauration avec service au volant', 'Comptoir fixe (cantine)', 'Crèmerie (bar laitier)', 'Traiteur'] },
          { code: 'C1I', nom: 'Alcool et cannabis', usages: ['Vente de boissons alcoolisées (SAQ), de cannabis et produits du cannabis (SQDC)'] },
        ],
      },
      {
        code: 'C2', nom: 'Commerce et service local',
        description: 'Bâtiments de plus grande superficie répondant aux besoins locaux à l\'échelle de la Ville.',
        sousClasses: [
          { code: 'C2A', nom: 'Service de restauration', usages: ['Restaurant', 'Café', 'Casse-croûte (cantine)', 'Traiteur', 'Microbrasserie avec service de repas'] },
          { code: 'C2B', nom: 'Service hôtelier', usages: ['Hôtel ou motel', 'Résidence de tourisme', 'Auberge ou gîte touristique'] },
          { code: 'C2C', nom: 'Divertissement', usages: ['Cinéma', 'Théâtre', 'Salle de billard', 'Golf miniature / virtuel', 'École artistique', 'Salon de quilles'] },
          { code: 'C2D', nom: 'Divertissement nocturne', usages: ['Bar, pub et taverne', 'Microbrasserie sans service de repas', 'Loterie et jeux de hasard', 'Boîte de nuit', 'Bar à spectacle et cabaret'] },
          { code: 'C2E', nom: 'Centre de conférence et de santé', usages: ['Centre de santé (saunas, spas, etc.)', 'Centre de conférence, de congrès et salle de réception'] },
          { code: 'C2F', nom: 'Vente et service relié aux bâtiments', usages: ['Nettoyage de fenêtres, extermination, entretien ménager, ramonage', 'Plomberie, chauffage, ventilation, climatisation, foyer', 'Aménagement paysager et jardin', 'Quincaillerie et matériaux de construction', 'Comptoir, armoire, meuble, appareil ménager et électronique', 'Peinture, décoration, matériel électrique et éclairage', 'Location d\'outils domestiques', 'Vente de matériaux de construction', 'Vente de revêtement de plancher', 'Centre de jardin'] },
          { code: 'C2G', nom: 'Poste d\'essence', usages: ['Poste d\'essence avec ou sans dépanneur', 'Station de recharge pour véhicules électriques', 'Lave-auto'] },
        ],
      },
      {
        code: 'C3', nom: 'Commerce et service régional',
        description: 'Usages répondant à un rayonnement régional au-delà des limites du territoire; entreposage/étalage extérieur possible; nuisances potentielles (achalandage, bruit, gabarit).',
        sousClasses: [
          { code: 'C3A', nom: 'Grossiste', usages: ['Produit alimentaire', 'Produit de consommation générale', 'Produit de restauration/hôtellerie'] },
          { code: 'C3B', nom: 'Commerce de grandes surfaces', usages: ['Centres commerciaux', 'Galeries de boutiques', 'Encan, vente aux enchères, marché aux puces', 'Magasins à rayons'] },
          { code: 'C3C', nom: 'Divertissement de grandes surfaces', usages: ['Piste de course intérieure et extérieure', 'Centre d\'amusement', 'Jeux d\'évasion, réalité virtuelle, arcade', 'Centre de tir pour armes à feu'] },
          { code: 'C3D', nom: 'Atelier de métiers', usages: ['Plombier, électricien, soudeur', 'Ferblantier, maçon, menuisier, peintre, sculpteur, ébéniste', 'Rembourreur'] },
          { code: 'C3E', nom: 'Services paysager', usages: ['Pépinière', 'Horticulture'] },
          { code: 'C3F', nom: 'Restauration', usages: ['Restauration avec service complet ou restreint', 'Restauration avec service au volant'] },
          { code: 'C3G', nom: 'Service spécialisé divers', usages: ['Prêteur sur gages', 'Établissement de services à caractère érotique', 'Vente au détail de produits à caractère érotique'] },
          { code: 'C3H', nom: 'Service hôtelier régional', usages: ['Hôtel'] },
        ],
      },
      {
        code: 'C4', nom: 'Commerce contraignant',
        description: 'Vente d\'un bien ou service à caractère contraignant en superficie intérieure/extérieure (vente, étalage, entreposage, manœuvres, stationnement); bruit, poussière, flux de camions possibles; généralement incompatible avec Habitation (sauf station-service).',
        sousClasses: [
          { code: 'C4A', nom: 'Contraignant', usages: ['Entrepreneur général et spécialisé en construction/rénovation', 'Location d\'outils de machinerie lourde avec entreposage intérieur', 'Démolition, déplacement de bâtiments, excavation', 'Paysagement ou déneigement'] },
          { code: 'C4B', nom: 'Particulier', usages: ['Vente/location d\'habitations motorisées, roulottes, tentes-roulottes', 'Vente de machinerie lourde et pour la ferme', 'Location d\'outils ou d\'équipements', 'Transport par autobus', 'Entreposage ou mini-entrepôts', 'Centre de distribution et de transbordement', 'Crématorium'] },
          { code: 'C4C', nom: 'Vente et location de véhicules', usages: ['Vente au détail de véhicules automobile et utilitaire', 'Location de véhicules automobile et utilitaire'] },
          { code: 'C4D', nom: 'Vente et location de véhicules lourds', usages: ['Vente et location de véhicules récréatifs (roulottes, motoneiges, bateaux, remorques)', 'Vente et location de camions'] },
          { code: 'C4E', nom: 'Entretien de véhicules', usages: ['Station-service', 'Pièces, pneus, batteries, accessoires automobiles', 'Réparation d\'automobiles', 'Lavage d\'automobiles', 'Remplacement de pièces et accessoires', 'Traitement antirouille, etc.', 'Remorquage'] },
        ],
      },
    ],
  },
  {
    id: 'industrie', nom: 'Industrie',
    classes: [
      {
        code: 'I1', nom: 'Recherche et développement',
        description: 'Recherche, innovation, développement et transfert technologique; activités à l\'intérieur du bâtiment; entreposage prohibé; faible risque d\'explosion ou d\'incendie.',
        sousClasses: [
          { code: 'I1A', nom: 'Prestige', usages: ['Centre de développement/fabrication de produits de haute technologie', 'Centre de données', 'Centre de services aux entreprises', 'Centre de recherche et développement', 'Incubateur industriel', 'Industrie pharmaceutique et de médicaments'] },
          { code: 'I1B', nom: 'Agriculture intérieure', usages: ['Cultures agricoles à l\'intérieur d\'un bâtiment'] },
        ],
      },
      {
        code: 'I2', nom: 'Industrie légère',
        description: 'Fabrication et transformation de matières à nuisance limitée sur le voisinage, sans risque important pour la santé; peut générer bruit, poussière, émanations, flux de camions.',
        sousClasses: [
          { code: 'I2A', nom: 'Légère', usages: ['Produits électriques et électroniques (hors production d\'électricité)', 'Matériel scientifique et professionnel', 'Enseignes, étalages et tableaux d\'affichage'] },
          { code: 'I2B', nom: 'Générant des odeurs', usages: ['Mise en conserve de fruits et légumes, spécialités alimentaires', 'Farine et céréales de table préparées', 'Produits laitiers', 'Produits de boulangerie, pain et pâtisserie', 'Préparation et conditionnement de poissons et fruits de mer', 'Tabac et cannabis'] },
        ],
      },
      {
        code: 'I3', nom: 'Industrie lourde',
        description: 'Production ou transformation générant des nuisances hors bâtiment ou des risques pour la sécurité publique ou l\'environnement; quais de chargement, circulation lourde, contamination possible.',
        sousClasses: [
          { code: 'I3A', nom: 'Dangereuse de fort impact', usages: ['Usages de l\'annexe III du Règlement sur la protection et la réhabilitation des terrains', 'Première transformation de métaux', 'Produits chimiques d\'usage agricole', 'Plastique et résines synthétiques', 'Peinture, teinture et vernis', 'Savons et détachants', 'Pâte à papier, papier et produits du papier', 'Papier asphalté pour couvertures', 'Ciment, produits en béton, produits abrasifs'] },
          { code: 'I3B', nom: 'Dangereuse de moindre impact', usages: ['Produits de construction en métal', 'Produits en pierre et en verre', 'Industrie du bois', 'Aliments pour animaux', 'Produits en plastique, en caoutchouc', 'Produits en mousse de polystyrène/d\'uréthane', 'Tuyauterie, pellicules et feuilles en plastique', 'Vestimentaire, chaussure et textile', 'Imprimerie et édition', 'Machinerie (sauf électrique)', 'Matériel de transport'] },
        ],
      },
      {
        code: 'I4', nom: 'Industrie contraignante',
        description: 'Extraction, traitement ou gestion de matières et d\'infrastructures publiques; activités majoritairement extérieures; nuisances, contamination du sol, activités possibles tard le soir ou la nuit.',
        sousClasses: [
          { code: 'I4A', nom: 'Infrastructure et utilité publique lourde', usages: ['Extraction (sablière, gravière)', 'Traitement des eaux usées avec ou sans bassin aéré', 'Dépôt de matériaux secs', 'Dépôt de neiges usées', 'Poste de transformation d\'électricité et équipements connexes'] },
        ],
      },
    ],
  },
  {
    id: 'public', nom: 'Public',
    classes: [
      {
        code: 'P1', nom: 'Parc, espace vert et place publique',
        description: 'Parcs, espaces verts, activités de plein air ou de récréation extérieure nécessitant des aménagements légers et de vastes espaces extérieurs.',
        sousClasses: [{ code: 'P1A', nom: 'Espace de détente', usages: ['Parc pour la récréation', 'Parc canin', 'Terrain de jeux et plateaux sportifs', 'Espace public'] }],
      },
      {
        code: 'P2', nom: 'Établissement d\'éducation, d\'institution et communautaire',
        description: 'Services à la population relatifs à la culture, l\'éducation, la récréation intensive, la santé et le culte, privés ou publics.',
        sousClasses: [
          { code: 'P2A', nom: 'Formation académique', usages: ['Garderie et prématernelle', 'École maternelle, primaire et secondaire', 'Université et cégep', 'Centre de formation spécialisé'] },
          { code: 'P2B', nom: 'Divertissement', usages: ['Équipement culturel (bibliothèque, musée, salle d\'exposition)', 'Centre communautaire ou de quartier, maison des jeunes', 'Camp de jour', 'Centre des loisirs', 'Aréna, patinoire réfrigérée', 'Marina, port de plaisance', 'Centre multisport', 'Golf extérieur', 'Stade extérieur', 'Salle de spectacle', 'Amphithéâtre ou auditorium'] },
          { code: 'P2C', nom: 'Lieu de culte', usages: ['Église, synagogue, mosquée, temple et presbytère', 'Columbarium', 'Site commémoratif', 'Cimetière et mausolée'] },
        ],
      },
      {
        code: 'P3', nom: 'Administration publique',
        description: 'Services à la population relatifs à la santé, aux services sociaux et à l\'administration publique.',
        sousClasses: [
          { code: 'P3A', nom: 'Service public', usages: ['Hôpital', 'Service d\'ambulance', 'Administration fédérale et régionale', 'CISSS', 'Palais de justice'] },
          { code: 'P3B', nom: 'Service public avec hébergement', usages: ['Centre d\'hébergement et de soins de longue durée (CHSLD)', 'Centre de protection de l\'enfance et de la jeunesse', 'Centre de réadaptation', 'Maison pour personnes en difficulté'] },
        ],
      },
      {
        code: 'P4', nom: 'Gestion des matières résiduelles',
        description: 'Réception ou valorisation des matières résiduelles; activités intérieures et extérieures; nuisances de bruit/poussière/émanation possibles; peut nécessiter des activités en continu.',
        sousClasses: [{ code: 'P4A', nom: 'Traitement et récupération', usages: ['Centre de tri', 'Centre de transbordement des matières résiduelles', 'Enfouissement des matières résiduelles', 'Entreposage et valorisation de résidus dangereux', 'Traitement/recyclage/fabrication de béton bitumineux', 'Entreposage, traitement, récupération, recyclage et valorisation de résidus'] }],
      },
    ],
  },
  {
    id: 'agricole', nom: 'Agricole',
    classes: [
      {
        code: 'A1', nom: 'Culture et élevage',
        description: 'Activités agricoles au sens de la Loi sur la protection du territoire et des activités agricoles.',
        sousClasses: [{ code: 'A1A', nom: 'Culture et élevage', usages: ['Culture du sol et des végétaux', 'Culture et exploitation d\'érablière (acéricole)', 'Entreposage, conditionnement, transformation et vente de produits agricoles de la ferme', 'Élevage d\'animaux', 'Pépinière forestière', 'Production de tourbe et de gazon en pièces', 'Reproduction d\'animaux domestiques', 'Terrain de pâture', 'Ferme expérimentale', 'Champignonnière, pisciculture, ferme d\'insectes'] }],
      },
      {
        code: 'A2', nom: 'Activité agrotouristique',
        description: 'Activités agrotouristiques et agroalimentaires complémentaires à l\'agriculture, dans une exploitation agricole.',
        sousClasses: [{ code: 'A2A', nom: 'Agrotourisme', usages: ['Ferme pédagogique', 'Atelier éducatif', 'Gîte d\'hébergement à la ferme', 'Table champêtre'] }],
      },
      {
        code: 'A3', nom: 'Para-agricole',
        description: 'Activités agricoles et para-agricoles liées à l\'élevage, aux soins, à l\'hébergement ou au traitement des animaux, et services spécialisés complémentaires (autorisation CPTAQ possible).',
        sousClasses: [{ code: 'A3A', nom: 'Service aux animaux', usages: ['Chenil (élevage, pension, dressage) avec autorisation CPTAQ', 'Vétérinaire (animaux d\'élevage/non domestiques) avec autorisation CPTAQ', 'Soins ou bien-être animal (SPCA, toilettage, réadaptation) avec autorisation CPTAQ'] }],
      },
    ],
  },
  {
    id: 'environnement', nom: 'Environnement naturel',
    classes: [
      {
        code: 'E1', nom: 'Conservation',
        description: 'Activités de conservation et de mise en valeur des milieux naturels et sensibles; aménagements légers et adaptés au milieu.',
        sousClasses: [{ code: 'E1A', nom: 'Conservation', usages: ['Aménagement faunique', 'Restauration des milieux naturels (lutte aux espèces exotiques envahissantes)', 'Réserve écologique', 'Réserve naturelle', 'Autre mesure de conservation efficace', 'Récréation extensive', 'Récréation intensive (activités publiques uniquement)'] }],
      },
      {
        code: 'E2', nom: 'Mise en valeur',
        description: 'Activités de mise en valeur et récréatives exploitant de vastes territoires, aménagements légers, en harmonie avec le milieu naturel.',
        sousClasses: [{ code: 'E2A', nom: 'Mise en valeur', usages: ['Sentier pédestre', 'Sentier de ski de fond', 'Sentier de raquette', 'Sentier équestre', 'Piste cyclable', 'Sentier de motoneige et quad', 'Abri sommaire ou haltes pour randonneurs', 'Centre d\'observation et d\'interprétation de la nature', 'Parc nature'] }],
      },
      {
        code: 'E3', nom: 'Foresterie',
        description: 'Activités de récolte de matière ligneuse.',
        sousClasses: [{ code: 'E3A', nom: 'Foresterie', usages: ['Production du bois', 'Produit provenant des arbres', 'Produit du bois et des arbres', 'Autres productions forestières et services connexes'] }],
      },
    ],
  },
];

// Articles réglementaires généraux (dispositions transversales), extraits
// du document de référence. Les numéros d'article officiels ne figurent
// pas dans le fichier fourni (trame en cours de rédaction) : ils sont
// donc identifiés par un intitulé plutôt qu'un numéro.
const SEED_ARTICLES = [
  { id: 'regle-contradiction', reference: 'TITRE 1 – Interprétation du règlement', titre: 'Règle en cas de contradiction', texte: 'En cas de contradiction entre les données d\'un tableau et un graphique, les données du tableau prévalent. En cas de contradiction entre le texte et la grille des usages et des normes de l\'annexe « B », le texte prévaut. En cas de contradiction entre la grille des usages et des normes de l\'annexe « B » et le plan de zonage de l\'annexe « A », la grille prévaut.' },
  { id: 'mesure-marge', reference: 'TITRE 3 – Règle générale de calcul et de mesure', titre: 'Mesure d\'une marge', texte: 'Une marge correspond à la distance horizontale minimale ou maximale, prescrite à l\'annexe « B », entre une ligne de terrain et un bâtiment principal. Cette distance est la plus courte mesurée horizontalement à partir de la ligne de terrain correspondant à cette marge. Une marge ne s\'applique pas à une construction entièrement souterraine.' },
  { id: 'mesure-empietement-saillie', reference: 'TITRE 3 – Règle générale de calcul et de mesure', titre: 'Mesure d\'un empiètement ou d\'une saillie', texte: 'Un empiètement se mesure à partir de la marge prescrite à l\'annexe « B » vers la ligne de terrain. Une saillie du bâtiment se mesure à partir du revêtement extérieur ou de la fondation extérieure du bâtiment, en l\'absence de revêtement.' },
  { id: 'mesure-hauteur', reference: 'TITRE 3 – Règle générale de calcul et de mesure', titre: 'Mesure de la hauteur d\'un bâtiment', texte: 'Pour un toit en pente, la hauteur se mesure depuis le niveau de la couronne de rue face au terrain jusqu\'au point le plus haut du bâtiment. Pour un toit plat, elle se mesure jusqu\'à la partie la plus élevée définie par le faîte du pignon. De façon non limitative, une antenne, une cheminée, un clocher, un équipement technique ou mécanique hors toit ou un silo ne sont pas comptabilisés dans la mesure de la hauteur.' },
  { id: 'mesure-etages', reference: 'TITRE 3 – Règle générale de calcul et de mesure', titre: 'Mesure du nombre d\'étages', texte: 'Le nombre d\'étages d\'un bâtiment correspond à la somme de ses étages, soit le rez-de-chaussée et les étages au-dessus de celui-ci. Un comble de toit aménagé en espace habitable est exempté du calcul, sauf s\'il est considéré comme un étage supplémentaire lorsque le dégagement vertical intérieur est de 1,8 m et plus sur toute sa superficie de plancher.' },
  { id: 'usage-combine', reference: 'TITRE 3 – Usage principal, accessoire et temporaire', titre: 'Usage combiné', texte: 'Les usages d\'une même classe d\'usage peuvent se trouver dans un même local pour constituer des usages combinés, chacun étant alors considéré pleinement à titre d\'usage principal. La sous-classe « C3G » Service spécialisé divers ne peut faire partie des usages combinés, à moins que les usages fassent partie de la même classe d\'usage.' },
  { id: 'batiment-mixte', reference: 'TITRE 3 – Usage principal, accessoire et temporaire', titre: 'Bâtiment mixte (usage mixte)', texte: 'Les usages mixtes des groupes Habitation et Commerce sont autorisés dans un même bâtiment, à l\'exception des usages « C3 » et « C4 » (conformité aux normes du groupe Commerce). Le groupe Commerce ne doit jamais être situé au-dessus d\'un logement. Les usages mixtes des groupes Commerce et Industrie ne sont autorisés que pour les usages « C4 » et industriels légers, en zone industrielle uniquement.' },
];

function classByCode(code) {
  for (const groupe of CLASSIFICATION) {
    for (const classe of groupe.classes) {
      if (classe.code === code) return { classe, groupe };
    }
  }
  return null;
}

function subclassByCode(code) {
  for (const groupe of CLASSIFICATION) {
    for (const classe of groupe.classes) {
      for (const sc of classe.sousClasses || []) {
        if (sc.code === code) return { sousClasse: sc, classe, groupe };
      }
    }
  }
  return null;
}

function describeUsageRef(ref) {
  const c = classByCode(ref);
  if (c) return `${ref} — ${c.classe.nom}`;
  const sc = subclassByCode(ref);
  if (sc) return `${ref} — ${sc.sousClasse.nom} (classe ${sc.classe.code})`;
  return ref;
}

function emptyNormes() {
  const n = {};
  FICHE_SECTIONS.forEach((section) => {
    n[section.id] = {};
    section.fields.forEach((f) => {
      n[section.id][`${f.key}Min`] = '';
      n[section.id][`${f.key}Max`] = '';
    });
  });
  return n;
}

function makeNormes(overrides) {
  const n = emptyNormes();
  Object.keys(overrides || {}).forEach((sectionId) => {
    Object.assign(n[sectionId], overrides[sectionId]);
  });
  return n;
}

// Données d'exemple (gabarit) pour les fiches de zonage — la trame de
// règlement fournie ne contenant pas l'annexe « B » réelle de
// Terrebonne, ces valeurs numériques sont fictives et doivent être
// remplacées par les fiches réelles (Administration → Import / Export).
const SEED_DATA = {
  meta: {
    reglementNumero: 'la trame du règlement unifié (modèle de travail, numéro officiel à déterminer)',
    dateMiseAJour: '2026-09-01',
  },
  classification: CLASSIFICATION,
  articles: SEED_ARTICLES,
  zones: [
    {
      id: 'h1', zonesAssociees: ['H-1'], nom: 'Habitation unifamiliale isolée', affectation: 'U',
      intention: 'Secteurs à dominance résidentielle de faible densité, composés principalement de maisons unifamiliales isolées, à l\'écart des usages commerciaux et industriels.',
      usagesAutorises: ['H1'], usagesProhibes: ['H4', 'H5', 'H6', 'Commerce (tous)', 'Industrie (tous)'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        terrain: { superficieMin: 450, largeurMin: 15, profondeurMin: 25 },
        logementDensite: { logementsParBatimentMax: 1 },
        volumetrie: { etagesMin: 1, etagesMax: 2, hauteurMin: 5, hauteurMax: 10.5, superficieImplantationMin: 70 },
        implantation: { avantMin: 6, avantSecondaireMin: 4.5, lateraleMin: 2, lateraleTotaleMin: 5 },
        coefficients: { cesMax: 35 },
      }),
      materiaux: 'Matériaux de revêtement extérieur nobles (brique, pierre, bois, fibrociment); le vinyle est limité aux surfaces secondaires.',
      entreposage: 'Aucun entreposage extérieur autorisé, sauf remise conforme aux dispositions sur les constructions accessoires.',
      dispositionSpecifique: '',
      amendement: '',
      referencesReglementaires: ['mesure-marge', 'mesure-hauteur'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'h2', zonesAssociees: ['H-2'], nom: 'Habitation bifamiliale et trifamiliale', affectation: 'U',
      intention: 'Secteurs résidentiels de densité moyenne permettant jusqu\'à 4 logements par bâtiment, en transition entre les secteurs unifamiliaux et les axes plus denses.',
      usagesAutorises: ['H2'], usagesProhibes: ['H1 (zone dédiée à la densification)', 'Industrie (tous)'],
      structureAutorisee: ['Isolée', 'Jumelé'],
      normes: makeNormes({
        terrain: { superficieMin: 550, largeurMin: 16 },
        logementDensite: { logementsParBatimentMin: 2, logementsParBatimentMax: 4 },
        volumetrie: { etagesMin: 1, etagesMax: 3, hauteurMax: 12, superficieImplantationMin: 90 },
        implantation: { avantMin: 5, lateraleMin: 2, lateraleTotaleMin: 5 },
        coefficients: { cesMax: 40 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: '', amendement: '',
      referencesReglementaires: ['mesure-marge'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'h3', zonesAssociees: ['H-3'], nom: 'Habitation multifamiliale', affectation: 'M',
      intention: 'Secteurs de plus forte densité résidentielle, généralement à proximité des axes de transport en commun et des services.',
      usagesAutorises: ['H4', 'H5'], usagesProhibes: ['Industrie (tous)', 'C3', 'C4'],
      structureAutorisee: ['Isolée', 'Projet intégré'],
      normes: makeNormes({
        terrain: { superficieMin: 1000, largeurMin: 20 },
        logementDensite: { logementsParHectareMin: 40, logementsParHectareMax: 75 },
        volumetrie: { etagesMin: 2, etagesMax: 5, hauteurMax: 18, superficieImplantationMin: 250 },
        implantation: { avantMin: 4, lateraleMin: 3, lateraleTotaleMin: 7 },
        coefficients: { cesMax: 45 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: 'Projet intégré assujetti aux dispositions de la Section « Projet intégré » du présent règlement.', amendement: '',
      referencesReglementaires: ['batiment-mixte'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'c1', zonesAssociees: ['C-1'], nom: 'Commerce de proximité', affectation: 'M',
      intention: 'Petit commerce de desserte locale, compatible avec le voisinage résidentiel immédiat.',
      usagesAutorises: ['C1'], usagesProhibes: ['C1I (à proximité d\'établissements scolaires — voir disposition spécifique)', 'Industrie (tous)'],
      structureAutorisee: ['Isolée', 'En rangée'],
      normes: makeNormes({
        terrain: { superficieMin: 300, largeurMin: 12 },
        volumetrie: { etagesMax: 2, hauteurMax: 11, superficieImplantationMax: 600 },
        implantation: { avantMin: 3, lateraleMin: 0 },
        coefficients: { cesMax: 60 },
      }),
      materiaux: '', entreposage: 'Étalage extérieur permis; entreposage extérieur prohibé.', dispositionSpecifique: '', amendement: '',
      referencesReglementaires: ['usage-combine'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'c2', zonesAssociees: ['C-2'], nom: 'Commerce artériel et de service', affectation: 'PE',
      intention: 'Commerce de plus grande envergure localisé le long des artères principales, à rayonnement local à régional.',
      usagesAutorises: ['C2', 'C3'], usagesProhibes: ['Habitation (tous, sauf logement du gardien)', 'Industrie lourde (I3, I4)'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        terrain: { superficieMin: 900, largeurMin: 25 },
        volumetrie: { etagesMax: 3, hauteurMax: 14 },
        implantation: { avantMin: 7, lateraleMin: 3, lateraleTotaleMin: 7 },
        coefficients: { cesMax: 50 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: '', amendement: '',
      referencesReglementaires: [],
      updatedAt: '2026-08-01',
    },
    {
      id: 'i1', zonesAssociees: ['I-1'], nom: 'Industrie légère', affectation: 'I',
      intention: 'Activités de fabrication, transformation ou entreposage à nuisances limitées sur le voisinage.',
      usagesAutorises: ['I1', 'I2'], usagesProhibes: ['Habitation (tous)', 'C1', 'C2'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        terrain: { superficieMin: 1500, largeurMin: 30 },
        volumetrie: { etagesMax: 2, hauteurMax: 15 },
        implantation: { avantMin: 9, lateraleMin: 4.5 },
        coefficients: { cesMax: 60 },
      }),
      materiaux: '', entreposage: 'Entreposage extérieur autorisé uniquement s\'il est clôturé et écranté par un aménagement paysager.', dispositionSpecifique: '', amendement: '',
      referencesReglementaires: [],
      updatedAt: '2026-08-01',
    },
    {
      id: 'a1', zonesAssociees: ['A-1'], nom: 'Agricole', affectation: 'AG',
      intention: 'Territoire agricole désigné, principalement dédié aux activités agricoles conformément à la Loi sur la protection du territoire et des activités agricoles.',
      usagesAutorises: ['A1', 'A2', 'A3'], usagesProhibes: ['Habitation non liée à l\'exploitation agricole', 'Industrie (tous)', 'Commerce (tous, sauf agrotouristique)'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        terrain: { superficieMin: 40000, largeurMin: 100 },
        logementDensite: { logementsParBatimentMax: 1 },
        volumetrie: { etagesMax: 2, hauteurMax: 12 },
        implantation: { avantMin: 15, lateraleMin: 10 },
        coefficients: { cesMax: 15 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: 'Résidence de l\'exploitant agricole : une seule résidence liée et nécessaire à l\'exploitation est autorisée par exploitation.', amendement: '',
      referencesReglementaires: [],
      updatedAt: '2026-08-01',
    },
    {
      id: 'p1', zonesAssociees: ['P-1'], nom: 'Publique et institutionnelle', affectation: 'U',
      intention: 'Équipements collectifs : écoles, bâtiments municipaux, lieux de culte, installations de santé.',
      usagesAutorises: ['P1', 'P2', 'P3'], usagesProhibes: ['Industrie (tous)', 'Commerce (tous)'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        terrain: { superficieMin: 1000, largeurMin: 20 },
        volumetrie: { etagesMax: 4, hauteurMax: 16 },
        implantation: { avantMin: 6, lateraleMin: 3 },
        coefficients: { cesMax: 50 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: '', amendement: '',
      referencesReglementaires: ['batiment-mixte'],
      updatedAt: '2026-08-01',
    },
    {
      id: 'e1', zonesAssociees: ['REC-1'], nom: 'Récréative et conservation', affectation: 'C',
      intention: 'Parcs, espaces verts, milieux naturels et corridors récréatifs protégés.',
      usagesAutorises: ['P1', 'E1', 'E2'], usagesProhibes: ['Habitation (tous)', 'Commerce (tous)', 'Industrie (tous)'],
      structureAutorisee: ['Isolée'],
      normes: makeNormes({
        volumetrie: { etagesMax: 1, hauteurMax: 8 },
        implantation: { avantMin: 8, lateraleMin: 5 },
        coefficients: { cesMax: 10 },
      }),
      materiaux: '', entreposage: '', dispositionSpecifique: 'Toute intervention à l\'intérieur d\'une bande de protection riveraine doit être conforme à la politique de protection des rives, du littoral et des plaines inondables.', amendement: '',
      referencesReglementaires: [],
      updatedAt: '2026-08-01',
    },
  ],
  adresses: [
    { id: 1, adresse: '123, rue Saint-Pierre', lot: '1 234 567', zoneId: 'h1' },
    { id: 2, adresse: '456, boulevard des Seigneurs', lot: '2 345 678', zoneId: 'c2' },
    { id: 3, adresse: '789, montée Masson', lot: '3 456 789', zoneId: 'a1' },
    { id: 4, adresse: '1200, rue des Pins', lot: '4 567 890', zoneId: 'h3' },
    { id: 5, adresse: '55, rue de l\'Industrie', lot: '5 678 901', zoneId: 'i1' },
    { id: 6, adresse: '10, rue de l\'École', lot: '6 789 012', zoneId: 'p1' },
  ],
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Impossible de lire les données locales, retour aux données d\'exemple.', e);
  }
  return clone(SEED_DATA);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function affectationByCode(code) {
  return AFFECTATIONS.find((a) => a.code === code);
}

function zoneById(id) {
  return state.data.zones.find((z) => z.id === id);
}

function articleById(id) {
  return state.data.articles.find((a) => a.id === id);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function linesToArray(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

function formatMinMax(min, max, unit) {
  const hasMin = min !== '' && min != null;
  const hasMax = max !== '' && max != null;
  const u = unit ? ` ${unit}` : '';
  if (!hasMin && !hasMax) return 'Non prescrit';
  if (hasMin && hasMax) return min === max ? `${min}${u}` : `${min} – ${max}${u}`;
  if (hasMin) return `${min}${u} minimum`;
  return `${max}${u} maximum`;
}

const state = {
  data: loadData(),
  isAdmin: false,
  activeCategory: null,
  searchQuery: '',
};

/* ------------------------- Navigation ------------------------- */

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    });
  });

  document.querySelectorAll('.tab-btn:not(.logout)').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  document.querySelectorAll('.subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(`public-${btn.dataset.subtab}`).classList.add('active');
    });
  });
}

/* ------------------------- Modal helper ------------------------- */

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('modalContent').innerHTML = '';
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

/* ------------------------- Classification (lecture) ------------------------- */

function renderClassificationTree() {
  const el = document.getElementById('classificationTree');
  el.innerHTML = state.data.classification.map((groupe) => `
    <div class="classif-group">
      <h3>${escapeHtml(groupe.nom)}</h3>
      ${groupe.classes.map((classe) => `
        <details class="classif-class">
          <summary><span class="code-badge">${escapeHtml(classe.code)}</span> ${escapeHtml(classe.nom)}</summary>
          <p class="classif-desc">${escapeHtml(classe.description || '')}</p>
          ${(classe.sousClasses || []).map((sc) => `
            <div class="classif-subclass">
              <strong><span class="code-badge small">${escapeHtml(sc.code)}</span> ${escapeHtml(sc.nom)}</strong>
              <ul>${sc.usages.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul>
            </div>`).join('')}
          ${classe.usages ? `<ul>${classe.usages.map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul>` : ''}
        </details>`).join('')}
    </div>`).join('');
}

/* ------------------------- Vue publique : zones ------------------------- */

function renderCategoryFilters() {
  const el = document.getElementById('categoryFilters');
  const chips = [`<button type="button" class="chip ${state.activeCategory === null ? 'active' : ''}" data-cat="">Toutes les zones</button>`]
    .concat(AFFECTATIONS.map((a) => `<button type="button" class="chip ${state.activeCategory === a.code ? 'active' : ''}" data-cat="${escapeHtml(a.code)}">${escapeHtml(a.nom)} (${escapeHtml(a.code)})</button>`));
  el.innerHTML = chips.join('');
  el.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.activeCategory = chip.dataset.cat || null;
      renderCategoryFilters();
      renderZoneGrid();
    });
  });
}

function matchingZonesForQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const addressMatch = state.data.adresses.find((a) =>
    a.adresse.toLowerCase().includes(q) || a.lot.toLowerCase().includes(q));
  if (addressMatch) return { zoneIds: [addressMatch.zoneId], addressMatch };
  const zoneIds = state.data.zones
    .filter((z) => z.nom.toLowerCase().includes(q) || (z.zonesAssociees || []).some((c) => c.toLowerCase().includes(q)))
    .map((z) => z.id);
  return { zoneIds, addressMatch: null };
}

function renderZoneGrid() {
  const grid = document.getElementById('zoneGrid');
  const info = document.getElementById('publicResultInfo');
  let zones = state.data.zones;

  if (state.activeCategory) {
    zones = zones.filter((z) => z.affectation === state.activeCategory);
  }

  let addressNote = '';
  const searchResult = matchingZonesForQuery(state.searchQuery);
  if (searchResult) {
    zones = zones.filter((z) => searchResult.zoneIds.includes(z.id));
    if (searchResult.addressMatch) {
      const z = zoneById(searchResult.addressMatch.zoneId);
      addressNote = `« ${escapeHtml(searchResult.addressMatch.adresse)} » (lot ${escapeHtml(searchResult.addressMatch.lot)}) se trouve dans la zone ${z ? escapeHtml((z.zonesAssociees || []).join(', ')) : '?'}.`;
    }
  }

  info.textContent = addressNote || (zones.length ? `${zones.length} fiche(s) de zonage affichée(s).` : 'Aucune zone ne correspond à la recherche.');

  grid.innerHTML = zones.map((z) => {
    const aff = affectationByCode(z.affectation);
    return `
      <article class="zone-card" data-zone="${z.id}">
        <div class="zone-card-bar"></div>
        <div class="zone-card-body">
          <div class="zone-card-head">
            <span class="zone-code">${escapeHtml((z.zonesAssociees || []).join(', '))}</span>
            <span class="zone-cat">${aff ? escapeHtml(`${aff.nom} (${aff.code})`) : escapeHtml(z.affectation || '')}</span>
          </div>
          <h3>${escapeHtml(z.nom)}</h3>
          <p class="zone-desc">${escapeHtml(z.intention)}</p>
          <button type="button" class="btn btn-secondary btn-sm view-zone-btn" data-zone="${z.id}">Voir la fiche</button>
        </div>
      </article>`;
  }).join('') || '<p class="empty-state">Aucune zone à afficher.</p>';

  grid.querySelectorAll('.view-zone-btn').forEach((btn) => {
    btn.addEventListener('click', () => showZoneDetail(btn.dataset.zone));
  });
}

function normesSectionHtml(zone) {
  return FICHE_SECTIONS.map((section) => {
    const rows = section.fields.map((f) => {
      const min = zone.normes[section.id][`${f.key}Min`];
      const max = zone.normes[section.id][`${f.key}Max`];
      return `<tr><th>${f.label}</th><td>${escapeHtml(formatMinMax(min, max))}</td></tr>`;
    }).join('');
    return `<h4>${section.titre}</h4><table class="normes-table"><tbody>${rows}</tbody></table>`;
  }).join('');
}

function showZoneDetail(zoneId) {
  const z = zoneById(zoneId);
  if (!z) return;
  const aff = affectationByCode(z.affectation);
  const refs = (z.referencesReglementaires || []).map(articleById).filter(Boolean);

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <div class="zone-detail">
      <div class="zone-card-head">
        <span class="zone-code">${escapeHtml((z.zonesAssociees || []).join(', '))}</span>
        <span class="zone-cat">${aff ? escapeHtml(`${aff.nom} (${aff.code})`) : escapeHtml(z.affectation || '')}</span>
      </div>
      <h2>${escapeHtml(z.nom)}</h2>
      <p>${escapeHtml(z.intention)}</p>

      <h3>Usages autorisés</h3>
      <ul>${z.usagesAutorises.map((u) => `<li>${escapeHtml(describeUsageRef(u))}</li>`).join('') || '<li class="muted">Aucun</li>'}</ul>

      <h3>Usages spécifiquement prohibés</h3>
      <ul>${z.usagesProhibes.map((u) => `<li>${escapeHtml(describeUsageRef(u))}</li>`).join('') || '<li class="muted">Aucun</li>'}</ul>

      <h3>Structure autorisée</h3>
      <p>${escapeHtml((z.structureAutorisee || []).join(', ') || 'Non précisé')}</p>

      <h3>Grille des normes</h3>
      ${normesSectionHtml(z)}

      ${z.materiaux ? `<h3>Matériaux</h3><p>${escapeHtml(z.materiaux)}</p>` : ''}
      ${z.entreposage ? `<h3>Aménagement de terrain (entreposage)</h3><p>${escapeHtml(z.entreposage)}</p>` : ''}
      ${z.dispositionSpecifique ? `<h3>Disposition spécifique</h3><p>${escapeHtml(z.dispositionSpecifique)}</p>` : ''}

      ${refs.length ? `<h3>Articles réglementaires liés</h3>
      <div class="linked-articles">
        ${refs.map((a) => `<div class="article-card"><p class="chapitre">${escapeHtml(a.reference)}</p><strong>${escapeHtml(a.titre)}</strong><p>${escapeHtml(a.texte)}</p></div>`).join('')}
      </div>` : ''}

      <p class="meta-note">Dernière modification : ${escapeHtml(z.updatedAt)}${z.amendement ? ` — Amendement : ${escapeHtml(z.amendement)}` : ''}</p>
    </div>
  `);
  document.querySelector('.modal-close').addEventListener('click', closeModal);
}

/* ------------------------- Administration : gate ------------------------- */

function initAdminGate() {
  const loginBtn = document.getElementById('adminLoginBtn');
  const passwordInput = document.getElementById('adminPassword');
  const errorEl = document.getElementById('adminLoginError');

  function tryLogin() {
    if (passwordInput.value === ADMIN_DEMO_PASSWORD) {
      state.isAdmin = true;
      document.getElementById('adminGate').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      errorEl.textContent = '';
      renderAdmin();
    } else {
      errorEl.textContent = 'Mot de passe incorrect (démonstration).';
    }
  }

  loginBtn.addEventListener('click', tryLogin);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    state.isAdmin = false;
    passwordInput.value = '';
    document.getElementById('adminGate').classList.remove('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
  });
}

/* ------------------------- Administration : zones (fiches de zonage) ------------------------- */

function renderZonesTable() {
  const tbody = document.getElementById('zonesTableBody');
  tbody.innerHTML = state.data.zones.map((z) => {
    const aff = affectationByCode(z.affectation);
    return `<tr>
      <td>${escapeHtml((z.zonesAssociees || []).join(', '))}</td>
      <td>${escapeHtml(z.nom)}</td>
      <td>${aff ? escapeHtml(`${aff.nom} (${aff.code})`) : escapeHtml(z.affectation || '')}</td>
      <td>${escapeHtml(z.updatedAt)}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-secondary edit-zone-btn" data-id="${z.id}">Modifier</button>
        <button type="button" class="btn btn-sm btn-danger delete-zone-btn" data-id="${z.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-state">Aucune zone.</td></tr>';

  tbody.querySelectorAll('.edit-zone-btn').forEach((b) => b.addEventListener('click', () => openZoneForm(zoneById(b.dataset.id))));
  tbody.querySelectorAll('.delete-zone-btn').forEach((b) => b.addEventListener('click', () => deleteZone(b.dataset.id)));
}

function deleteZone(id) {
  const z = zoneById(id);
  if (!z) return;
  if (!confirm(`Supprimer la fiche de zonage « ${(z.zonesAssociees || []).join(', ')} — ${z.nom} » ? Cette action est irréversible.`)) return;
  state.data.zones = state.data.zones.filter((zone) => zone.id !== id);
  saveData();
  renderZonesTable();
  renderZoneGrid();
}

function allClassCodes() {
  const codes = [];
  state.data.classification.forEach((groupe) => {
    groupe.classes.forEach((classe) => codes.push({ code: classe.code, nom: classe.nom, groupe: groupe.nom }));
  });
  return codes;
}

function openZoneForm(zone) {
  const isNew = !zone;
  const z = zone ? clone(zone) : {
    id: '', zonesAssociees: [], nom: '', affectation: AFFECTATIONS[0].code,
    intention: '', usagesAutorises: [], usagesProhibes: [], structureAutorisee: [],
    normes: emptyNormes(), materiaux: '', entreposage: '', dispositionSpecifique: '', amendement: '',
    referencesReglementaires: [], updatedAt: todayISO(),
  };
  const codes = allClassCodes();

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvelle fiche de zonage' : `Modifier la fiche « ${escapeHtml((z.zonesAssociees || []).join(', '))} »`}</h2>
    <form id="zoneForm" class="stacked-form">
      <div class="form-row">
        <div class="form-group">
          <label for="zZones">Zone(s) associée(s) <span class="required">*</span></label>
          <input id="zZones" required value="${escapeHtml((z.zonesAssociees || []).join(', '))}" placeholder="ex. H-1, H-1a" />
        </div>
        <div class="form-group">
          <label for="zAffectation">Grande affectation</label>
          <select id="zAffectation">
            ${AFFECTATIONS.map((a) => `<option value="${a.code}" ${a.code === z.affectation ? 'selected' : ''}>${escapeHtml(a.nom)} (${escapeHtml(a.code)})</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group full-width">
        <label for="zNom">Nom du type de milieu <span class="required">*</span></label>
        <input id="zNom" required value="${escapeHtml(z.nom)}" />
      </div>
      <div class="form-group full-width">
        <label for="zIntention">Intention</label>
        <textarea id="zIntention" rows="2">${escapeHtml(z.intention)}</textarea>
      </div>

      <div class="form-group full-width">
        <label>Usages autorisés (classes)</label>
        <div class="checkbox-grid">
          ${codes.map((c) => `<label class="checkbox-label"><input type="checkbox" class="usage-autorise-cb" value="${escapeHtml(c.code)}" ${z.usagesAutorises.includes(c.code) ? 'checked' : ''} /> ${escapeHtml(c.code)} — ${escapeHtml(c.nom)}</label>`).join('')}
        </div>
      </div>
      <div class="form-group full-width">
        <label for="zUsagesProhibes">Usages spécifiquement prohibés (un par ligne — code de classe/sous-classe ou texte libre)</label>
        <textarea id="zUsagesProhibes" rows="2">${escapeHtml((z.usagesProhibes || []).join('\n'))}</textarea>
      </div>

      <div class="form-group full-width">
        <label>Structure autorisée</label>
        <div class="checkbox-grid">
          ${STRUCTURES_AUTORISEES.map((s) => `<label class="checkbox-label"><input type="checkbox" class="structure-cb" value="${escapeHtml(s)}" ${(z.structureAutorisee || []).includes(s) ? 'checked' : ''} /> ${escapeHtml(s)}</label>`).join('')}
        </div>
      </div>

      ${FICHE_SECTIONS.map((section) => `
        <h3>${section.titre}</h3>
        <div class="form-row normes-grid">
          ${section.fields.map((f) => `
            <div class="form-group minmax-group">
              <label>${f.label}</label>
              <div class="minmax-inputs">
                <input id="nm_${section.id}_${f.key}Min" placeholder="min." value="${escapeHtml(z.normes[section.id][`${f.key}Min`])}" />
                <span>–</span>
                <input id="nm_${section.id}_${f.key}Max" placeholder="max." value="${escapeHtml(z.normes[section.id][`${f.key}Max`])}" />
              </div>
            </div>`).join('')}
        </div>`).join('')}

      <div class="form-group full-width">
        <label for="zMateriaux">Matériaux</label>
        <textarea id="zMateriaux" rows="2">${escapeHtml(z.materiaux)}</textarea>
      </div>
      <div class="form-group full-width">
        <label for="zEntreposage">Aménagement de terrain (entreposage)</label>
        <textarea id="zEntreposage" rows="2">${escapeHtml(z.entreposage)}</textarea>
      </div>
      <div class="form-group full-width">
        <label for="zDispositionSpecifique">Disposition spécifique</label>
        <textarea id="zDispositionSpecifique" rows="2">${escapeHtml(z.dispositionSpecifique)}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="zAmendement">Amendement et date</label>
          <input id="zAmendement" value="${escapeHtml(z.amendement)}" placeholder="ex. Règlement 1500-3, 2026-05-12" />
        </div>
        <div class="form-group">
          <label for="zReferences">Articles réglementaires liés (identifiants séparés par des virgules)</label>
          <input id="zReferences" value="${escapeHtml((z.referencesReglementaires || []).join(', '))}" placeholder="ex. mesure-marge, mesure-hauteur" />
        </div>
      </div>

      <span class="error-msg" id="zoneFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="zoneFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer la fiche' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('zoneFormCancel').addEventListener('click', closeModal);
  document.getElementById('zoneForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const zonesAssociees = document.getElementById('zZones').value.split(',').map((s) => s.trim()).filter(Boolean);
    const nom = document.getElementById('zNom').value.trim();
    if (!zonesAssociees.length || !nom) {
      document.getElementById('zoneFormError').textContent = 'Au moins une zone associée et le nom du type de milieu sont obligatoires.';
      return;
    }
    const id = isNew ? (slugify(zonesAssociees[0]) || `zone-${Date.now()}`) : z.id;
    if (isNew && zoneById(id)) {
      document.getElementById('zoneFormError').textContent = 'Une fiche avec un identifiant équivalent existe déjà.';
      return;
    }
    const normes = emptyNormes();
    FICHE_SECTIONS.forEach((section) => {
      section.fields.forEach((f) => {
        normes[section.id][`${f.key}Min`] = document.getElementById(`nm_${section.id}_${f.key}Min`).value.trim();
        normes[section.id][`${f.key}Max`] = document.getElementById(`nm_${section.id}_${f.key}Max`).value.trim();
      });
    });
    const updated = {
      id, zonesAssociees, nom,
      affectation: document.getElementById('zAffectation').value,
      intention: document.getElementById('zIntention').value.trim(),
      usagesAutorises: Array.from(document.querySelectorAll('.usage-autorise-cb:checked')).map((cb) => cb.value),
      usagesProhibes: linesToArray(document.getElementById('zUsagesProhibes').value),
      structureAutorisee: Array.from(document.querySelectorAll('.structure-cb:checked')).map((cb) => cb.value),
      normes,
      materiaux: document.getElementById('zMateriaux').value.trim(),
      entreposage: document.getElementById('zEntreposage').value.trim(),
      dispositionSpecifique: document.getElementById('zDispositionSpecifique').value.trim(),
      amendement: document.getElementById('zAmendement').value.trim(),
      referencesReglementaires: document.getElementById('zReferences').value.split(',').map((s) => s.trim()).filter(Boolean),
      updatedAt: todayISO(),
    };
    if (isNew) {
      state.data.zones.push(updated);
    } else {
      const idx = state.data.zones.findIndex((zone) => zone.id === z.id);
      state.data.zones[idx] = updated;
    }
    saveData();
    closeModal();
    renderZonesTable();
    renderZoneGrid();
  });
}

/* ------------------------- Administration : adresses ------------------------- */

function renderAdressesTable() {
  const tbody = document.getElementById('adressesTableBody');
  tbody.innerHTML = state.data.adresses.map((a) => {
    const z = zoneById(a.zoneId);
    return `<tr>
      <td>${escapeHtml(a.adresse)}</td>
      <td>${escapeHtml(a.lot)}</td>
      <td>${z ? escapeHtml((z.zonesAssociees || []).join(', ')) : '<span class="muted">Zone introuvable</span>'}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-secondary edit-adresse-btn" data-id="${a.id}">Modifier</button>
        <button type="button" class="btn btn-sm btn-danger delete-adresse-btn" data-id="${a.id}">Supprimer</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-state">Aucune entrée.</td></tr>';

  tbody.querySelectorAll('.edit-adresse-btn').forEach((b) => b.addEventListener('click', () => openAdresseForm(state.data.adresses.find((a) => String(a.id) === b.dataset.id))));
  tbody.querySelectorAll('.delete-adresse-btn').forEach((b) => b.addEventListener('click', () => deleteAdresse(b.dataset.id)));
}

function deleteAdresse(id) {
  if (!confirm('Supprimer cette entrée adresse/lot ?')) return;
  state.data.adresses = state.data.adresses.filter((a) => String(a.id) !== String(id));
  saveData();
  renderAdressesTable();
}

function openAdresseForm(adresse) {
  const isNew = !adresse;
  const a = adresse ? clone(adresse) : { id: Date.now(), adresse: '', lot: '', zoneId: state.data.zones[0] ? state.data.zones[0].id : '' };

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvelle adresse / lot' : 'Modifier l\'entrée'}</h2>
    <form id="adresseForm" class="stacked-form">
      <div class="form-group full-width">
        <label for="aAdresse">Adresse <span class="required">*</span></label>
        <input id="aAdresse" required value="${escapeHtml(a.adresse)}" placeholder="ex. 123, rue Saint-Pierre" />
      </div>
      <div class="form-group full-width">
        <label for="aLot">Numéro de lot <span class="required">*</span></label>
        <input id="aLot" required value="${escapeHtml(a.lot)}" placeholder="ex. 1 234 567" />
      </div>
      <div class="form-group full-width">
        <label for="aZone">Zone <span class="required">*</span></label>
        <select id="aZone">
          ${state.data.zones.map((z) => `<option value="${z.id}" ${z.id === a.zoneId ? 'selected' : ''}>${escapeHtml((z.zonesAssociees || []).join(', '))} — ${escapeHtml(z.nom)}</option>`).join('')}
        </select>
      </div>
      <span class="error-msg" id="adresseFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="adresseFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('adresseFormCancel').addEventListener('click', closeModal);
  document.getElementById('adresseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const adresseVal = document.getElementById('aAdresse').value.trim();
    const lotVal = document.getElementById('aLot').value.trim();
    if (!adresseVal || !lotVal) {
      document.getElementById('adresseFormError').textContent = 'L\'adresse et le numéro de lot sont obligatoires.';
      return;
    }
    const updated = { id: a.id, adresse: adresseVal, lot: lotVal, zoneId: document.getElementById('aZone').value };
    if (isNew) {
      state.data.adresses.push(updated);
    } else {
      const idx = state.data.adresses.findIndex((x) => x.id === a.id);
      state.data.adresses[idx] = updated;
    }
    saveData();
    closeModal();
    renderAdressesTable();
  });
}

/* ------------------------- Administration : articles ------------------------- */

function renderArticlesList() {
  const el = document.getElementById('articlesList');
  el.innerHTML = state.data.articles.map((a) => `
    <div class="article-card admin-article">
      <div class="article-card-head">
        <strong>${escapeHtml(a.titre)}</strong>
        <div class="actions-cell">
          <button type="button" class="btn btn-sm btn-secondary edit-article-btn" data-id="${a.id}">Modifier</button>
          <button type="button" class="btn btn-sm btn-danger delete-article-btn" data-id="${a.id}">Supprimer</button>
        </div>
      </div>
      <p class="chapitre">${escapeHtml(a.reference)}</p>
      <p>${escapeHtml(a.texte)}</p>
    </div>
  `).join('') || '<p class="empty-state">Aucun article.</p>';

  el.querySelectorAll('.edit-article-btn').forEach((b) => b.addEventListener('click', () => openArticleForm(articleById(b.dataset.id))));
  el.querySelectorAll('.delete-article-btn').forEach((b) => b.addEventListener('click', () => deleteArticle(b.dataset.id)));
}

function deleteArticle(id) {
  if (!confirm('Supprimer cet article ?')) return;
  state.data.articles = state.data.articles.filter((a) => a.id !== id);
  state.data.zones.forEach((z) => {
    z.referencesReglementaires = (z.referencesReglementaires || []).filter((aid) => aid !== id);
  });
  saveData();
  renderArticlesList();
}

function openArticleForm(article) {
  const isNew = !article;
  const a = article ? clone(article) : { id: '', reference: '', titre: '', texte: '' };

  openModal(`
    <button type="button" class="modal-close" aria-label="Fermer">&times;</button>
    <h2>${isNew ? 'Nouvel article' : `Modifier « ${escapeHtml(a.titre)} »`}</h2>
    <form id="articleForm" class="stacked-form">
      <div class="form-row">
        <div class="form-group">
          <label for="artId">Identifiant <span class="required">*</span></label>
          <input id="artId" required value="${escapeHtml(a.id)}" placeholder="ex. mesure-hauteur" ${isNew ? '' : 'readonly'} />
        </div>
        <div class="form-group">
          <label for="artReference">Référence (titre/chapitre)</label>
          <input id="artReference" value="${escapeHtml(a.reference)}" placeholder="ex. TITRE 3 – Règle générale de calcul et de mesure" />
        </div>
      </div>
      <div class="form-group full-width">
        <label for="artTitre">Titre <span class="required">*</span></label>
        <input id="artTitre" required value="${escapeHtml(a.titre)}" />
      </div>
      <div class="form-group full-width">
        <label for="artTexte">Texte <span class="required">*</span></label>
        <textarea id="artTexte" rows="5" required>${escapeHtml(a.texte)}</textarea>
      </div>
      <span class="error-msg" id="articleFormError"></span>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="articleFormCancel">Annuler</button>
        <button type="submit" class="btn btn-primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>
  `);

  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('articleFormCancel').addEventListener('click', closeModal);
  document.getElementById('articleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('artId').value.trim();
    const titre = document.getElementById('artTitre').value.trim();
    const texte = document.getElementById('artTexte').value.trim();
    if (!id || !titre || !texte) {
      document.getElementById('articleFormError').textContent = 'L\'identifiant, le titre et le texte sont obligatoires.';
      return;
    }
    if (isNew && articleById(id)) {
      document.getElementById('articleFormError').textContent = 'Un article avec cet identifiant existe déjà.';
      return;
    }
    const updated = { id, reference: document.getElementById('artReference').value.trim(), titre, texte };
    if (isNew) {
      state.data.articles.push(updated);
    } else {
      const idx = state.data.articles.findIndex((x) => x.id === a.id);
      state.data.articles[idx] = updated;
    }
    saveData();
    closeModal();
    renderArticlesList();
  });
}

/* ------------------------- Administration : import / export ------------------------- */

function initIO() {
  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    exportBtn.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const msgEl = document.getElementById('ioMessage');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.zones)) {
          throw new Error('Le fichier doit contenir au minimum un tableau "zones".');
        }
        if (!confirm('Remplacer toutes les données actuelles par le contenu de ce fichier ?')) return;
        state.data = {
          meta: parsed.meta || { reglementNumero: 'Importé', dateMiseAJour: todayISO() },
          classification: parsed.classification || CLASSIFICATION,
          zones: parsed.zones || [],
          articles: parsed.articles || [],
          adresses: parsed.adresses || [],
        };
        saveData();
        renderAll();
        msgEl.style.color = 'var(--success)';
        msgEl.textContent = 'Importation réussie.';
      } catch (err) {
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = `Erreur d'importation : ${err.message}`;
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (!confirm('Réinitialiser toutes les données aux exemples de démonstration ? Les modifications seront perdues.')) return;
    state.data = clone(SEED_DATA);
    saveData();
    renderAll();
  });

  document.getElementById('schemaExample').textContent = JSON.stringify({
    meta: { reglementNumero: '...', dateMiseAJour: 'AAAA-MM-JJ' },
    classification: '[ voir la structure exportée : groupes > classes > sous-classes ]',
    zones: [{
      id: 'h1', zonesAssociees: ['H-1'], nom: '...', affectation: 'U', intention: '...',
      usagesAutorises: ['H1'], usagesProhibes: ['H4'], structureAutorisee: ['Isolée'],
      normes: { terrain: { superficieMin: 450, superficieMax: '', largeurMin: 15, largeurMax: '', profondeurMin: '', profondeurMax: '' } },
      materiaux: '...', entreposage: '...', dispositionSpecifique: '...', amendement: '',
      referencesReglementaires: ['mesure-marge'], updatedAt: 'AAAA-MM-JJ',
    }],
    articles: [{ id: 'mesure-marge', reference: '...', titre: '...', texte: '...' }],
    adresses: [{ id: 1, adresse: '...', lot: '...', zoneId: 'h1' }],
  }, null, 2);
}

/* ------------------------- Recherche publique ------------------------- */

function initPublicSearch() {
  document.getElementById('publicSearch').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderZoneGrid();
  });
}

/* ------------------------- Render / init ------------------------- */

function renderAdmin() {
  renderZonesTable();
  renderAdressesTable();
  renderArticlesList();
}

function renderAll() {
  document.getElementById('reglementNumero').textContent = state.data.meta.reglementNumero;
  renderCategoryFilters();
  renderZoneGrid();
  renderClassificationTree();
  if (state.isAdmin) renderAdmin();
}

document.getElementById('addZoneBtn').addEventListener('click', () => openZoneForm(null));
document.getElementById('addAdresseBtn').addEventListener('click', () => openAdresseForm(null));
document.getElementById('addArticleBtn').addEventListener('click', () => openArticleForm(null));

initNav();
initAdminGate();
initIO();
initPublicSearch();
renderAll();
