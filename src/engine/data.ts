/**
 * Fictional world data. Everything is invented so the game ships with no
 * licensed names; a future "editor" could load real data from a JSON file.
 */

export interface NationDef {
  code: string;
  weight: number;
  first: string[];
  last: string[];
}

const BRIT_FIRST = [
  'Adam', 'Alfie', 'Ben', 'Callum', 'Charlie', 'Connor', 'Daniel', 'Danny', 'Dean', 'Elliot', 'Finley', 'George',
  'Harry', 'Harvey', 'Jack', 'Jake', 'James', 'Jamie', 'Joe', 'Jordan', 'Josh', 'Kieran', 'Kyle', 'Lewis', 'Liam',
  'Louis', 'Luke', 'Marcus', 'Mason', 'Matt', 'Max', 'Nathan', 'Oliver', 'Owen', 'Reece', 'Rhys', 'Ross', 'Ryan',
  'Sam', 'Scott', 'Sean', 'Tom', 'Tyler', 'Wes', 'Will', 'Zach', 'Aaron', 'Archie', 'Bradley', 'Cameron', 'Craig',
  'Ellis', 'Frazer', 'Gary', 'Jonjo', 'Kai', 'Lee', 'Nicky', 'Paul', 'Stuart',
];
const ENG_LAST = [
  'Ashby', 'Barker', 'Bell', 'Bennett', 'Bishop', 'Bradshaw', 'Brooks', 'Carter', 'Chambers', 'Clarke', 'Cole',
  'Cooper', 'Crossley', 'Dawson', 'Dixon', 'Doyle', 'Ellis', 'Fletcher', 'Foster', 'Gibbs', 'Goodwin', 'Hale',
  'Harding', 'Hartley', 'Hayes', 'Hewitt', 'Holloway', 'Hughes', 'Jennings', 'Kemp', 'Lambert', 'Lawson', 'Marsh',
  'Mason', 'Mills', 'Moss', 'Naylor', 'Osborne', 'Parker', 'Pearce', 'Pritchard', 'Rowe', 'Sharpe', 'Simmons',
  'Slater', 'Stokes', 'Summers', 'Thorne', 'Tindall', 'Turner', 'Wade', 'Walsh', 'Webb', 'Whitaker', 'Wilde',
  'Woodward', 'Wright', 'Yates', 'Pickford', 'Garside', 'Rudd', 'Ingham', 'Tate', 'Buckley', 'Fenwick',
];
const SCO_LAST = [
  'McAllister', 'Fraser', 'Buchanan', 'Crawford', 'Docherty', 'Ferguson', 'Gillespie', 'Kerr', 'Lindsay',
  'McBride', 'McCann', 'McLeod', 'Munro', 'Ritchie', 'Sinclair', 'Strachan', 'Wallace', 'Baird',
];
const WAL_LAST = ['Bowen', 'Griffiths', 'Howells', 'Jenkins', 'Lloyd', 'Meredith', 'Morgan', 'Powell', 'Pryce', 'Vaughan'];
const IRL_LAST = ['Brennan', 'Byrne', 'Doherty', 'Fitzgerald', 'Gallagher', 'Keane', 'Kavanagh', "O'Brien", "O'Neill", 'Quinn', 'Sheridan', 'Walsh'];
const IRL_FIRST = ['Aidan', 'Cian', 'Conor', 'Darragh', 'Declan', 'Eoin', 'Fionn', 'Niall', 'Ronan', 'Seamus', 'Shane', 'Padraig'];

export const NATIONS: NationDef[] = [
  { code: 'ENG', weight: 58, first: BRIT_FIRST, last: ENG_LAST },
  { code: 'SCO', weight: 8, first: BRIT_FIRST, last: SCO_LAST },
  { code: 'WAL', weight: 5, first: BRIT_FIRST, last: WAL_LAST },
  { code: 'IRL', weight: 6, first: IRL_FIRST, last: IRL_LAST },
  { code: 'NIR', weight: 2, first: BRIT_FIRST, last: IRL_LAST },
  {
    code: 'FRA', weight: 3,
    first: ['Antoine', 'Bastien', 'Clément', 'Florian', 'Hugo', 'Julien', 'Lucas', 'Mathis', 'Noé', 'Théo', 'Yanis'],
    last: ['Bernard', 'Chevalier', 'Dubois', 'Fontaine', 'Garnier', 'Lefèvre', 'Mercier', 'Moreau', 'Perrin', 'Rousseau'],
  },
  {
    code: 'NED', weight: 2,
    first: ['Bram', 'Daan', 'Jesper', 'Joost', 'Lars', 'Milan', 'Sem', 'Thijs', 'Wout'],
    last: ['Bakker', 'de Graaf', 'Hendriks', 'Jansen', 'Kuipers', 'van Dijkhuis', 'Verbeek', 'Visser', 'Smit'],
  },
  {
    code: 'ESP', weight: 2,
    first: ['Álvaro', 'Dani', 'Iker', 'Javi', 'Marcos', 'Pablo', 'Rubén', 'Sergio', 'Unai'],
    last: ['Arroyo', 'Castaño', 'Díaz', 'Fuentes', 'Iglesias', 'Montero', 'Navarro', 'Ortega', 'Vidal'],
  },
  {
    code: 'NOR', weight: 2,
    first: ['Anders', 'Eirik', 'Håkon', 'Jonas', 'Magnus', 'Sindre', 'Tobias'],
    last: ['Berg', 'Dahl', 'Haugen', 'Lund', 'Nygaard', 'Solberg', 'Strand'],
  },
  {
    code: 'GER', weight: 2,
    first: ['Jonas', 'Leon', 'Luca', 'Niklas', 'Tim', 'Felix', 'Maximilian', 'Paul', 'Jan', 'Lukas', 'Moritz', 'Julian', 'Florian', 'Tobias'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Braun', 'Krüger', 'Hartmann'],
  },
  {
    code: 'ITA', weight: 2,
    first: ['Alessandro', 'Lorenzo', 'Matteo', 'Andrea', 'Francesco', 'Federico', 'Davide', 'Riccardo', 'Tommaso', 'Gabriele', 'Simone', 'Nicolò', 'Pietro', 'Luca'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa'],
  },
  {
    code: 'BRA', weight: 1,
    first: ['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Guilherme', 'Rafael', 'Vinícius', 'Felipe', 'Bruno', 'Thiago', 'Caio', 'Igor'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Alves', 'Ribeiro', 'Gomes', 'Martins', 'Rocha'],
  },
  {
    code: 'NGA', weight: 2,
    first: ['Chidi', 'Emeka', 'Femi', 'Ifeanyi', 'Kelechi', 'Tunde', 'Uche'],
    last: ['Adebayo', 'Eze', 'Nwankwo', 'Obi', 'Okafor', 'Okonkwo', 'Salako'],
  },
  {
    code: 'JAM', weight: 2,
    first: ['Andre', 'Dwayne', 'Jermaine', 'Kemar', 'Leon', 'Marlon', 'Ricardo'],
    last: ['Blake', 'Campbell', 'Francis', 'Grant', 'Morrison', 'Reid', 'Thompson'],
  },
  {
    code: 'POR', weight: 1,
    first: ['Diogo', 'Gonçalo', 'João', 'Rafael', 'Rui', 'Tiago'],
    last: ['Almeida', 'Carvalho', 'Correia', 'Ferreira', 'Pinto', 'Teixeira'],
  },
  {
    code: 'DEN', weight: 1,
    first: ['Kasper', 'Mads', 'Mikkel', 'Rasmus', 'Søren'],
    last: ['Andersen', 'Kjær', 'Madsen', 'Nørgaard', 'Poulsen'],
  },
  {
    code: 'SEN', weight: 1,
    first: ['Abdou', 'Cheikh', 'Ibrahima', 'Moussa', 'Pape'],
    last: ['Diallo', 'Diop', 'Faye', 'Ndiaye', 'Sarr'],
  },

  // Pools for the rest of Europe's clubs in the UEFA competitions (never drawn at random).
  { code: 'TUR', weight: 0, first: ['Arda', 'Barış', 'Burak', 'Cenk', 'Emre', 'Ferdi', 'Hakan', 'İrfan', 'Kaan', 'Kerem', 'Mert', 'Oğuz', 'Orkun', 'Salih', 'Yusuf'], last: ['Akgün', 'Aydın', 'Çelik', 'Demir', 'Doğan', 'Erkin', 'Kaya', 'Kılıç', 'Kökçü', 'Özcan', 'Şahin', 'Tosun', 'Uğurlu', 'Yıldız', 'Yılmaz'] },
  { code: 'GRE', weight: 0, first: ['Andreas', 'Christos', 'Dimitris', 'Giorgos', 'Kostas', 'Manolis', 'Nikos', 'Panagiotis', 'Petros', 'Sotiris', 'Tasos', 'Vangelis'], last: ['Alexandropoulos', 'Bakasetas', 'Giannoulis', 'Karetsas', 'Konstantelias', 'Mantalos', 'Papadopoulos', 'Pelkas', 'Siopis', 'Tzolis', 'Vlachodimos', 'Zeca'] },
  { code: 'CZE', weight: 0, first: ['Adam', 'David', 'Jakub', 'Jan', 'Lukáš', 'Matěj', 'Michal', 'Ondřej', 'Pavel', 'Tomáš', 'Václav', 'Vladimír'], last: ['Černý', 'Doudera', 'Holeš', 'Jurásek', 'Král', 'Krejčí', 'Novák', 'Provod', 'Souček', 'Šulc', 'Vlček', 'Zima'] },
  { code: 'POL', weight: 0, first: ['Bartosz', 'Jakub', 'Kacper', 'Kamil', 'Krzysztof', 'Mateusz', 'Michał', 'Piotr', 'Przemysław', 'Sebastian', 'Tomasz', 'Wojciech'], last: ['Bednarek', 'Frankowski', 'Grosicki', 'Kamiński', 'Kiwior', 'Kowalski', 'Nowak', 'Piątek', 'Szymański', 'Wiśniewski', 'Zieliński', 'Zalewski'] },
  { code: 'CRO', weight: 0, first: ['Ante', 'Bruno', 'Domagoj', 'Ivan', 'Josip', 'Luka', 'Marko', 'Mario', 'Martin', 'Mateo', 'Nikola', 'Petar'], last: ['Baturina', 'Brekalo', 'Jakić', 'Juranović', 'Kovačić', 'Majer', 'Mišić', 'Perišić', 'Petković', 'Sosa', 'Stanišić', 'Vlašić'] },
  { code: 'SRB', weight: 0, first: ['Aleksandar', 'Dušan', 'Filip', 'Lazar', 'Luka', 'Marko', 'Miloš', 'Nemanja', 'Nikola', 'Sergej', 'Stefan', 'Uroš'], last: ['Babić', 'Gudelj', 'Ilić', 'Jović', 'Kostić', 'Lukić', 'Milenković', 'Mitrović', 'Pavlović', 'Rakić', 'Tadić', 'Živković'] },
  { code: 'UKR', weight: 0, first: ['Andriy', 'Artem', 'Bohdan', 'Heorhiy', 'Illia', 'Mykola', 'Oleksandr', 'Oleh', 'Ruslan', 'Serhiy', 'Viktor', 'Yehor'], last: ['Bondar', 'Dovbyk', 'Kovalenko', 'Malinovskyi', 'Matviyenko', 'Mudryk', 'Shaparenko', 'Stepanenko', 'Sudakov', 'Tsyhankov', 'Yaremchuk', 'Zabarnyi'] },
  { code: 'SWE', weight: 0, first: ['Anton', 'Emil', 'Erik', 'Gustav', 'Hugo', 'Isak', 'Jesper', 'Linus', 'Ludwig', 'Oscar', 'Samuel', 'Viktor'], last: ['Andersson', 'Bergström', 'Ekdal', 'Forsberg', 'Gyökeres', 'Johansson', 'Karlsson', 'Larsson', 'Lindelöf', 'Nilsson', 'Svanberg', 'Zeneli'] },
  { code: 'HUN', weight: 0, first: ['Attila', 'Balázs', 'Barnabás', 'Bence', 'Dániel', 'Dominik', 'Gábor', 'Kevin', 'Krisztián', 'Milos', 'Roland', 'Zsolt'], last: ['Ádám', 'Fiola', 'Kerkez', 'Kovács', 'Nagy', 'Orbán', 'Sallai', 'Schäfer', 'Styles', 'Szalai', 'Szoboszlai', 'Varga'] },
  { code: 'ROU', weight: 0, first: ['Alexandru', 'Andrei', 'Denis', 'Dennis', 'Florin', 'Ianis', 'Ionuț', 'Marius', 'Nicolae', 'Radu', 'Răzvan', 'Valentin'], last: ['Chiricheș', 'Drăgușin', 'Hagi', 'Ivan', 'Man', 'Marin', 'Mihăilă', 'Nedelcearu', 'Popescu', 'Rațiu', 'Stanciu', 'Tănase'] },
];

export interface ClubDef {
  town: string;
  suffix: string;
  short: string;
  colours: [string, string];
  stadium: string;
}

/** Twenty invented clubs. Reputation is assigned at random per new game. */
export const CLUBS: ClubDef[] = [
  { town: 'Ashcombe', suffix: 'Athletic', short: 'ASH', colours: ['#c8102e', '#ffffff'], stadium: 'Mill Lane' },
  { town: 'Bramwell', suffix: 'Rovers', short: 'BRA', colours: ['#1d4ed8', '#ffffff'], stadium: 'The Brambles' },
  { town: 'Caldermoor', suffix: 'United', short: 'CAL', colours: ['#f59e0b', '#111111'], stadium: 'Moorside Park' },
  { town: 'Dunholt', suffix: 'Town', short: 'DUN', colours: ['#15803d', '#ffffff'], stadium: 'Holt Road' },
  { town: 'Eastwold', suffix: 'City', short: 'EAS', colours: ['#7dd3fc', '#0f172a'], stadium: 'Wold Stadium' },
  { town: 'Fernleigh', suffix: 'Albion', short: 'FER', colours: ['#6b21a8', '#fde68a'], stadium: 'Leigh Meadow' },
  { town: 'Greyhaven', suffix: 'Wanderers', short: 'GRE', colours: ['#111827', '#e5e7eb'], stadium: 'Harbour Ground' },
  { town: 'Hartsfield', suffix: 'County', short: 'HAR', colours: ['#991b1b', '#fcd34d'], stadium: 'County Park' },
  { town: 'Kestrel Bay', suffix: 'FC', short: 'KES', colours: ['#0e7490', '#ffffff'], stadium: 'The Cliffs' },
  { town: 'Lowmarsh', suffix: 'Town', short: 'LOW', colours: ['#ea580c', '#1f2937'], stadium: 'Marsh End' },
  { town: 'Merrow Vale', suffix: 'FC', short: 'MER', colours: ['#fbbf24', '#1e3a8a'], stadium: 'Vale Park Road' },
  { town: 'Northgate', suffix: 'United', short: 'NOR', colours: ['#dc2626', '#111827'], stadium: 'Gatehouse Stadium' },
  { town: 'Oakhurst', suffix: 'Athletic', short: 'OAK', colours: ['#14532d', '#fef3c7'], stadium: 'The Oaks' },
  { town: 'Pellham', suffix: 'City', short: 'PEL', colours: ['#1e40af', '#fbbf24'], stadium: 'Pellham Arena' },
  { town: 'Quarry Hill', suffix: 'Rangers', short: 'QUA', colours: ['#78716c', '#ffffff'], stadium: 'Stoneworks' },
  { town: 'Ravensmoor', suffix: 'Rovers', short: 'RAV', colours: ['#000000', '#dc2626'], stadium: 'Ravens Nest' },
  { town: 'Saltby', suffix: 'Harbour', short: 'SAL', colours: ['#0369a1', '#f97316'], stadium: 'Quayside' },
  { town: 'Underwood', suffix: 'Forest', short: 'UND', colours: ['#166534', '#facc15'], stadium: 'Woodland Park' },
  { town: 'Westmere', suffix: 'Town', short: 'WES', colours: ['#be123c', '#bae6fd'], stadium: 'Meregate' },
  { town: 'Yardley Cross', suffix: 'Albion', short: 'YAR', colours: ['#312e81', '#f1f5f9'], stadium: 'The Crossing' },
];

export const INJURIES: { name: string; min: number; max: number; w?: number; surgical?: { risk: number; lasting?: boolean } }[] = [
  { name: 'Bruised ankle', min: 1, max: 1 },
  { name: 'Dead leg', min: 1, max: 1 },
  { name: 'Tight hamstring', min: 1, max: 2 },
  { name: 'Groin strain', min: 2, max: 4 },
  { name: 'Hamstring strain', min: 2, max: 5 },
  { name: 'Calf strain', min: 1, max: 3 },
  { name: 'Twisted knee', min: 2, max: 4 },
  { name: 'Sprained ankle', min: 2, max: 5 },
  { name: 'Broken toe', min: 3, max: 6 },
  { name: 'Knee ligament damage', min: 6, max: 14, surgical: { risk: 0.12 } },
  { name: 'Broken leg', min: 16, max: 26, surgical: { risk: 0.14, lasting: true } },
  { name: 'Fractured metatarsal', min: 6, max: 10, w: 0.2, surgical: { risk: 0.08 } },
  { name: 'Ruptured Achilles', min: 26, max: 34, w: 0.1, surgical: { risk: 0.2, lasting: true } },
  { name: 'Cruciate ligament rupture', min: 26, max: 40, w: 0.15, surgical: { risk: 0.2, lasting: true } },
];

/** Relative chance of each injury in INJURIES: common knocks far more often than the long ones. */
export function injuryWeights(): number[] {
  return INJURIES.map((d, i) => d.w ?? Math.max(0.3, 10 - i * 1.1));
}
