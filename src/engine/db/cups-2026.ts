/**
 * The real 2026/27 calendar and cup data (see docs/research-cups-2026-27.md for sources).
 * Dates are 'YYYY-MM-DD'. Later seasons reuse the same pattern, moved to the same weekday.
 */

/** League matchday dates (weekend rounds are the Saturday; midweek rounds the Wednesday; a few Sundays). */
export const LEAGUE_DATES: Record<string, string[]> = {
  ENG: ['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07',
    '2026-11-21', '2026-11-28', '2026-12-02', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26', '2026-12-30', '2027-01-02', '2027-01-06',
    '2027-01-16', '2027-01-23', '2027-01-30', '2027-02-06', '2027-02-10', '2027-02-20', '2027-02-27', '2027-03-03', '2027-03-13', '2027-03-20',
    '2027-04-10', '2027-04-17', '2027-04-24', '2027-05-01', '2027-05-08', '2027-05-15', '2027-05-23', '2027-05-30'],
  ESP: ['2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-16', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24',
    '2026-10-31', '2026-11-07', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-02', '2027-01-09', '2027-01-16',
    '2027-01-23', '2027-01-30', '2027-02-06', '2027-02-13', '2027-02-20', '2027-02-27', '2027-03-06', '2027-03-13', '2027-03-20', '2027-04-03',
    '2027-04-10', '2027-04-17', '2027-04-21', '2027-05-01', '2027-05-08', '2027-05-15', '2027-05-22', '2027-05-29'],
  GER: ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07', '2026-11-21',
    '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-09', '2027-01-13', '2027-01-16', '2027-01-23', '2027-01-30', '2027-02-06',
    '2027-02-13', '2027-02-20', '2027-02-27', '2027-03-03', '2027-03-06', '2027-03-13', '2027-03-20', '2027-04-03', '2027-04-10', '2027-04-17',
    '2027-04-24', '2027-05-08', '2027-05-15', '2027-05-22'],
  ITA: ['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-28', '2026-10-31',
    '2026-11-07', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2027-01-02', '2027-01-06', '2027-01-09', '2027-01-16',
    '2027-01-23', '2027-01-30', '2027-02-06', '2027-02-13', '2027-02-20', '2027-02-27', '2027-03-06', '2027-03-13', '2027-03-20', '2027-04-03',
    '2027-04-10', '2027-04-17', '2027-04-24', '2027-05-01', '2027-05-08', '2027-05-15', '2027-05-22', '2027-05-29'],
  FRA: ['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07',
    '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12', '2027-01-02', '2027-01-16', '2027-01-23', '2027-01-30', '2027-02-06', '2027-02-13',
    '2027-02-20', '2027-02-27', '2027-03-06', '2027-03-13', '2027-03-20', '2027-04-03', '2027-04-10', '2027-04-17', '2027-04-24', '2027-05-01',
    '2027-05-08', '2027-05-16', '2027-05-22', '2027-05-29'],
  POR: ['2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-10-10', '2026-10-24', '2026-10-31',
    '2026-11-07', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26', '2027-01-09', '2027-01-16', '2027-01-23', '2027-01-30',
    '2027-02-06', '2027-02-13', '2027-02-20', '2027-02-27', '2027-03-06', '2027-03-13', '2027-03-20', '2027-04-03', '2027-04-10', '2027-04-17',
    '2027-04-24', '2027-05-01', '2027-05-08', '2027-05-15'],
};

/**
 * The English Football League's 46 matchdays: the Premier League's Saturdays and midweek dates plus
 * a dozen more, since the Championship finishes on 1 May and League One and Two on 8 May.
 */
const EFL_EXTRA = ['2026-08-15', '2026-08-19', '2026-09-01', '2026-09-08', '2026-10-13', '2026-11-04', '2026-11-24', '2026-12-09', '2026-12-22', '2027-01-19', '2027-02-16', '2027-04-03'];
LEAGUE_DATES.EN2 = [...LEAGUE_DATES.ENG.filter((d) => d <= '2027-05-01'), ...EFL_EXTRA].sort();
LEAGUE_DATES.EN3 = [...LEAGUE_DATES.ENG.filter((d) => d <= '2027-05-08'), ...EFL_EXTRA.filter((d) => d !== '2026-09-08')].sort();
LEAGUE_DATES.EN4 = LEAGUE_DATES.EN3;

/**
 * Second divisions elsewhere play on their top flight's dates. Segunda and Serie B finish earlier
 * (Serie B on 8 May, Segunda on 15 May), since their play-offs follow, so a few midweek dates are added.
 */
const MID_EXTRA = ['2026-09-02', '2026-11-04', '2027-01-27', '2027-02-24', '2027-03-10', '2027-04-14'];
const shortened = (top: string, last: string, rounds: number): string[] => {
  const dates = LEAGUE_DATES[top].filter((d) => d <= last);
  for (const d of MID_EXTRA) if (dates.length < rounds && !dates.includes(d)) dates.push(d);
  return dates.sort();
};
LEAGUE_DATES.ES2 = shortened('ESP', '2027-05-15', 38);
LEAGUE_DATES.IT2 = shortened('ITA', '2027-05-08', 38);
LEAGUE_DATES.DE2 = LEAGUE_DATES.GER;
LEAGUE_DATES.FR2 = LEAGUE_DATES.FRA;
LEAGUE_DATES.PT2 = LEAGUE_DATES.POR;

/** FIFA international windows (phase 5 uses these for call-ups). */
export const INTERNATIONAL_WINDOWS: [string, string][] = [['2026-09-21', '2026-10-06'], ['2026-11-09', '2026-11-17'], ['2027-03-22', '2027-03-30'], ['2027-06-07', '2027-06-15']];

/* ───────────────────────── Clubs outside the six leagues ───────────────────────── */

/** [name, short, division, tier (0–10), colours, stadium, capacity] */
export type ExtRow = [string, string, string, number, [string, string], string, number];

const C = (a: string, b: string): [string, string] => [a, b];
const RED = '#c8102e', WHITE = '#ffffff', BLUE = '#1c3f94', SKY = '#6cabdd', BLACK = '#111111', YELLOW = '#f5c400', GREEN = '#0b7a3b', NAVY = '#14213d', CLARET = '#7a1f3d', ORANGE = '#f28c28', AMBER = '#f0a500', PURPLE = '#5b2a86', MAROON = '#6b1b1b', GREY = '#8a8d91';

export const LOWER: Record<string, ExtRow[]> = {
  ENG: [
    ['Birmingham City', 'BIR', 'Championship', 4.6, C(BLUE, WHITE), "St Andrew's", 29409], ['Blackburn Rovers', 'BLB', 'Championship', 4.2, C(BLUE, WHITE), 'Ewood Park', 31367],
    ['Bolton Wanderers', 'BOL', 'Championship', 3.9, C(WHITE, NAVY), 'Toughsheet Community Stadium', 28723], ['Bristol City', 'BRC', 'Championship', 4.3, C(RED, WHITE), 'Ashton Gate', 26462],
    ['Burnley', 'BUR', 'Championship', 5.0, C(CLARET, SKY), 'Turf Moor', 21990], ['Cardiff City', 'CAR', 'Championship', 3.9, C(BLUE, WHITE), 'Cardiff City Stadium', 33280],
    ['Charlton Athletic', 'CHA', 'Championship', 3.9, C(RED, WHITE), 'The Valley', 27111], ['Derby County', 'DER', 'Championship', 4.1, C(WHITE, BLACK), 'Pride Park Stadium', 33597],
    ['Lincoln City', 'LIN', 'Championship', 3.7, C(RED, WHITE), 'Sincil Bank', 11400], ['Middlesbrough', 'MID', 'Championship', 4.5, C(RED, WHITE), 'Riverside Stadium', 34742],
    ['Millwall', 'MIL', 'Championship', 4.2, C(NAVY, WHITE), 'The Den', 20146], ['Norwich City', 'NOR', 'Championship', 4.3, C(YELLOW, GREEN), 'Carrow Road', 27359],
    ['Portsmouth', 'POR', 'Championship', 4.0, C(BLUE, WHITE), 'Fratton Park', 20867], ['Preston North End', 'PNE', 'Championship', 4.0, C(WHITE, NAVY), 'Deepdale', 23408],
    ['Queens Park Rangers', 'QPR', 'Championship', 4.0, C(BLUE, WHITE), 'Loftus Road', 18439], ['Sheffield United', 'SHU', 'Championship', 4.5, C(RED, WHITE), 'Bramall Lane', 32050],
    ['Southampton', 'SOU', 'Championship', 4.7, C(RED, WHITE), "St Mary's Stadium", 32384], ['Stoke City', 'STK', 'Championship', 4.1, C(RED, WHITE), 'bet365 Stadium', 30089],
    ['Swansea City', 'SWA', 'Championship', 4.1, C(WHITE, BLACK), 'Swansea.com Stadium', 21088], ['Watford', 'WAT', 'Championship', 4.2, C(YELLOW, BLACK), 'Vicarage Road', 22200],
    ['West Bromwich Albion', 'WBA', 'Championship', 4.4, C(NAVY, WHITE), 'The Hawthorns', 26850], ['West Ham United', 'WHU', 'Championship', 5.3, C(CLARET, SKY), 'London Stadium', 62500],
    ['Wolverhampton Wanderers', 'WOL', 'Championship', 5.2, C(AMBER, BLACK), 'Molineux Stadium', 31750], ['Wrexham', 'WRE', 'Championship', 4.1, C(RED, WHITE), 'Racecourse Ground', 10771],
    ['Leicester City', 'LEI', 'League One', 3.8, C(BLUE, WHITE), 'King Power Stadium', 32259], ['Sheffield Wednesday', 'SHW', 'League One', 3.1, C(BLUE, WHITE), 'Hillsborough Stadium', 39732],
    ['Oxford United', 'OXF', 'League One', 3.1, C(YELLOW, NAVY), 'Kassam Stadium', 12500], ['Luton Town', 'LUT', 'League One', 3.3, C(ORANGE, NAVY), 'Kenilworth Road', 12056],
    ['Huddersfield Town', 'HUD', 'League One', 3.2, C(BLUE, WHITE), 'Kirklees Stadium', 24121], ['Wigan Athletic', 'WIG', 'League One', 3.0, C(BLUE, WHITE), 'Brick Community Stadium', 25138],
    ['Reading', 'REA', 'League One', 3.0, C(BLUE, WHITE), 'Madejski Stadium', 24161], ['Barnsley', 'BAR', 'League One', 3.0, C(RED, WHITE), 'Oakwell', 23287],
    ['Blackpool', 'BLP', 'League One', 3.0, C(ORANGE, WHITE), 'Bloomfield Road', 16500], ['Bradford City', 'BRA', 'League One', 2.9, C(CLARET, AMBER), 'Valley Parade', 24840],
    ['Plymouth Argyle', 'PLY', 'League One', 3.0, C(GREEN, WHITE), 'Home Park', 17900], ['Peterborough United', 'PET', 'League One', 2.9, C(BLUE, WHITE), 'London Road Stadium', 13512],
    ['Stockport County', 'STO', 'League One', 3.0, C(BLUE, WHITE), 'Edgeley Park', 10852], ['Wycombe Wanderers', 'WYC', 'League One', 2.9, C(SKY, NAVY), 'Adams Park', 10446],
    ['Doncaster Rovers', 'DON', 'League One', 2.8, C(RED, WHITE), 'Eco-Power Stadium', 15231], ['Notts County', 'NTC', 'League One', 2.8, C(BLACK, WHITE), 'Meadow Lane', 19841],
    ['Milton Keynes Dons', 'MKD', 'League One', 2.8, C(WHITE, BLACK), 'Stadium MK', 30500], ['Mansfield Town', 'MAN', 'League One', 2.7, C(AMBER, BLUE), 'Field Mill', 10022],
    ['Leyton Orient', 'LEY', 'League One', 2.7, C(RED, WHITE), 'Brisbane Road', 9271], ['AFC Wimbledon', 'WIM', 'League One', 2.6, C(BLUE, YELLOW), 'Plough Lane', 9215],
    ['Cambridge United', 'CAM', 'League One', 2.6, C(AMBER, BLACK), 'Abbey Stadium', 7937], ['Stevenage', 'STE', 'League One', 2.6, C(RED, WHITE), 'Broadhall Way', 7318],
    ['Burton Albion', 'BRT', 'League One', 2.5, C(YELLOW, BLACK), 'Pirelli Stadium', 6912], ['Bromley', 'BRO', 'League One', 2.5, C(WHITE, BLACK), 'Hayes Lane', 6100],
    ['Bristol Rovers', 'BRR', 'League Two', 2.2, C(BLUE, WHITE), 'Memorial Stadium', 12500], ['Port Vale', 'PVA', 'League Two', 2.1, C(WHITE, BLACK), 'Vale Park', 16800],
    ['Rotherham United', 'ROT', 'League Two', 2.2, C(RED, WHITE), 'New York Stadium', 12021], ['Swindon Town', 'SWI', 'League Two', 2.0, C(RED, WHITE), 'County Ground', 15728],
    ['Tranmere Rovers', 'TRA', 'League Two', 1.9, C(WHITE, BLUE), 'Prenton Park', 16789], ['Grimsby Town', 'GRI', 'League Two', 1.9, C(BLACK, WHITE), 'Blundell Park', 9052],
    ['Gillingham', 'GIL', 'League Two', 1.9, C(BLUE, WHITE), 'Priestfield Stadium', 11582], ['Oldham Athletic', 'OLD', 'League Two', 1.8, C(BLUE, WHITE), 'Boundary Park', 13513],
    ['Chesterfield', 'CHE', 'League Two', 1.9, C(BLUE, WHITE), 'SMH Group Stadium', 10504], ['Walsall', 'WAL', 'League Two', 1.9, C(RED, WHITE), 'Bescot Stadium', 11300],
    ['Salford City', 'SAL', 'League Two', 1.8, C(RED, WHITE), 'Moor Lane', 5108], ['York City', 'YOR', 'League Two', 1.7, C(RED, NAVY), 'York Community Stadium', 8500],
    ['Accrington Stanley', 'ACC', 'League Two', 1.6, C(RED, WHITE), 'Crown Ground', 5450], ['Barnet', 'BNT', 'League Two', 1.8, C(AMBER, BLACK), 'The Hive Stadium', 6500],
    ['Cheltenham Town', 'CHT', 'League Two', 1.7, C(RED, WHITE), 'Whaddon Road', 7066], ['Colchester United', 'COL', 'League Two', 1.8, C(BLUE, WHITE), 'Colchester Community Stadium', 10105],
    ['Crawley Town', 'CRA', 'League Two', 1.6, C(RED, WHITE), 'Broadfield Stadium', 5996], ['Crewe Alexandra', 'CRE', 'League Two', 1.9, C(RED, WHITE), 'Gresty Road', 10153],
    ['Exeter City', 'EXE', 'League Two', 1.9, C(RED, WHITE), 'St James Park', 8219], ['Fleetwood Town', 'FLE', 'League Two', 1.7, C(RED, WHITE), 'Highbury Stadium', 5327],
    ['Newport County', 'NEW', 'League Two', 1.6, C(AMBER, BLACK), 'Rodney Parade', 7850], ['Northampton Town', 'NTH', 'League Two', 1.8, C(CLARET, WHITE), 'Sixfields Stadium', 8203],
    ['Rochdale', 'ROC', 'League Two', 1.7, C(BLUE, BLACK), 'Spotland Stadium', 10249], ['Shrewsbury Town', 'SHR', 'League Two', 1.8, C(BLUE, AMBER), 'New Meadow', 9875],
    ['Carlisle United', 'CRL', 'National League', 1.4, C(BLUE, WHITE), 'Brunton Park', 17949], ['Southend United', 'SOT', 'National League', 1.3, C(BLUE, WHITE), 'Roots Hall', 12392],
    ['Hartlepool United', 'HAR', 'National League', 1.2, C(BLUE, WHITE), 'Victoria Park', 7856], ['Yeovil Town', 'YEO', 'National League', 1.1, C(GREEN, WHITE), 'Huish Park', 9566],
    ['AFC Fylde', 'FYL', 'National League', 1.0, C(WHITE, RED), 'Mill Farm Sports Village', 6000], ['Aldershot Town', 'ALD', 'National League', 1.0, C(RED, BLUE), 'The Recreation Ground', 7100],
    ['Altrincham', 'ALT', 'National League', 1.0, C(RED, WHITE), 'Moss Lane', 7700], ['Barrow', 'BRW', 'National League', 1.1, C(BLUE, WHITE), 'Holker Street', 6500],
    ['Boreham Wood', 'BOR', 'National League', 0.9, C(WHITE, BLACK), 'Meadow Park', 4500], ['Boston United', 'BOS', 'National League', 0.9, C(AMBER, BLACK), 'Boston Community Stadium', 5061],
    ['Eastleigh', 'EAS', 'National League', 0.9, C(BLUE, WHITE), 'Ten Acres', 5250], ['FC Halifax Town', 'HAL', 'National League', 1.0, C(BLUE, WHITE), 'The Shay', 10400],
    ['Forest Green Rovers', 'FGR', 'National League', 1.0, C(GREEN, BLACK), 'The New Lawn', 5147], ['Gateshead', 'GAT', 'National League', 1.0, C(WHITE, BLACK), 'Gateshead International Stadium', 11800],
    ['Harrogate Town', 'HGT', 'National League', 1.2, C(AMBER, BLACK), 'Wetherby Road', 5000], ['Hornchurch', 'HOR', 'National League', 0.7, C(RED, WHITE), 'Hornchurch Stadium', 3500],
    ['Kidderminster Harriers', 'KID', 'National League', 0.9, C(RED, WHITE), 'Aggborough Stadium', 6444], ['Scunthorpe United', 'SCU', 'National League', 1.1, C(CLARET, SKY), 'Glanford Park', 9088],
    ['Solihull Moors', 'SOL', 'National League', 0.9, C(BLUE, AMBER), 'Damson Park', 5500], ['Sutton United', 'SUT', 'National League', 0.9, C(AMBER, MAROON), 'Gander Green Lane', 5013],
    ['Tamworth', 'TAM', 'National League', 0.8, C(RED, WHITE), 'The Lamb Ground', 4565], ['Wealdstone', 'WEA', 'National League', 0.8, C(BLUE, WHITE), 'Grosvenor Vale', 4085],
    ['Woking', 'WOK', 'National League', 0.8, C(RED, WHITE), 'Kingfield Stadium', 6036], ['Worthing', 'WOR', 'National League', 0.7, C(RED, WHITE), 'Woodside Road', 4000],
  ],
  ESP: [
    ['Mallorca', 'MLL', 'Segunda División', 4.2, C(RED, BLACK), 'Son Moix', 23142], ['Girona', 'GIR', 'Segunda División', 4.3, C(RED, WHITE), 'Montilivi', 14624],
    ['Real Oviedo', 'OVI', 'Segunda División', 3.8, C(BLUE, WHITE), 'Carlos Tartiere', 30500], ['Sporting Gijón', 'SPG', 'Segunda División', 3.3, C(RED, WHITE), 'El Molinón', 29371],
    ['Real Valladolid', 'VLL', 'Segunda División', 3.4, C(PURPLE, WHITE), 'José Zorrilla', 27618], ['Las Palmas', 'LPA', 'Segunda División', 3.5, C(YELLOW, BLUE), 'Estadio Gran Canaria', 32392],
    ['Leganés', 'LEG', 'Segunda División', 3.3, C(BLUE, WHITE), 'Butarque', 14422], ['Granada', 'GRA', 'Segunda División', 3.3, C(RED, WHITE), 'Nuevo Los Cármenes', 19189],
    ['Cádiz', 'CAD', 'Segunda División', 3.2, C(YELLOW, BLUE), 'Nuevo Mirandilla', 20724], ['Almería', 'ALM', 'Segunda División', 3.4, C(RED, WHITE), 'UD Almería Stadium', 15000],
    ['Eibar', 'EIB', 'Segunda División', 3.1, C(BLUE, CLARET), 'Ipurua', 8164], ['Albacete', 'ALB', 'Segunda División', 2.9, C(WHITE, BLACK), 'Carlos Belmonte', 17524],
    ['Burgos', 'BUR', 'Segunda División', 2.9, C(WHITE, BLACK), 'El Plantío', 12194], ['Castellón', 'CAS', 'Segunda División', 2.9, C(BLACK, WHITE), 'Castàlia', 15500],
    ['Córdoba', 'COR', 'Segunda División', 2.9, C(GREEN, WHITE), 'Nuevo Arcángel', 20989], ['Tenerife', 'TEN', 'Segunda División', 2.9, C(WHITE, BLUE), 'Heliodoro Rodríguez López', 22824],
    ['Andorra', 'AND', 'Segunda División', 2.7, C(BLUE, RED), 'Nou Estadi Encamp', 5108], ['Ceuta', 'CEU', 'Segunda División', 2.5, C(WHITE, BLACK), 'Alfonso Murube', 6500],
    ['Eldense', 'ELD', 'Segunda División', 2.5, C(BLUE, WHITE), 'Pepico Amat', 5776], ['Sabadell', 'SAB', 'Segunda División', 2.5, C(BLUE, WHITE), 'Nova Creu Alta', 11908],
    ['Zaragoza', 'ZAR', 'Primera Federación', 2.4, C(WHITE, BLUE), 'Ibercaja Stadium', 20000], ['Huesca', 'HUE', 'Primera Federación', 2.2, C(BLUE, CLARET), 'El Alcoraz', 9100],
    ['Mirandés', 'MIR', 'Primera Federación', 2.2, C(RED, BLACK), 'Anduva', 5759], ['Cultural Leonesa', 'CUL', 'Primera Federación', 2.1, C(WHITE, RED), 'Reino de León', 13346],
    ['Murcia', 'MUR', 'Primera Federación', 2.0, C(RED, BLUE), 'Enrique Roca', 31179], ['Hércules', 'HER', 'Primera Federación', 1.9, C(BLUE, WHITE), 'José Rico Pérez', 30000],
    ['Cartagena', 'CTG', 'Primera Federación', 1.9, C(BLACK, WHITE), 'Cartagonova', 15105], ['Gimnàstic', 'GIM', 'Primera Federación', 1.8, C(RED, WHITE), 'Nou Estadi', 14591],
    ['Ponferradina', 'PON', 'Primera Federación', 1.8, C(BLUE, WHITE), 'El Toralín', 8400], ['Lugo', 'LUG', 'Primera Federación', 1.7, C(RED, WHITE), 'Anxo Carro', 7070],
    ['Racing Ferrol', 'FER', 'Primera Federación', 1.8, C(GREEN, BLACK), 'A Malata', 12043], ['Alcorcón', 'ALC', 'Primera Federación', 1.7, C(YELLOW, BLUE), 'Santo Domingo', 5100],
    ['Algeciras', 'ALG', 'Primera Federación', 1.6, C(RED, WHITE), 'Nuevo Mirador', 7200], ['Ibiza', 'IBI', 'Primera Federación', 1.7, C(SKY, WHITE), 'Can Misses', 6000],
    ['Unionistas', 'UNI', 'Primera Federación', 1.5, C(WHITE, BLACK), 'Reina Sofía', 5000], ['Pontevedra', 'PTV', 'Primera Federación', 1.5, C(CLARET, WHITE), 'Pasarón', 12000],
    ['Barakaldo', 'BKD', 'Primera Federación', 1.5, C(YELLOW, BLACK), 'Lasesarre', 7960], ['Real Unión', 'RUN', 'Primera Federación', 1.4, C(WHITE, BLACK), 'Stadium Gal', 5000],
    ['Mérida', 'MER', 'Primera Federación', 1.5, C(BLACK, WHITE), 'Estadio Romano', 14600], ['Jaén', 'JAE', 'Primera Federación', 1.4, C(WHITE, BLUE), 'La Victoria', 12569],
    ['Antequera', 'ANT', 'Primera Federación', 1.3, C(GREEN, WHITE), 'El Maulí', 6000], ['Zamora', 'ZAM', 'Primera Federación', 1.3, C(RED, WHITE), 'Ruta de la Plata', 7813],
    ['Teruel', 'TER', 'Primera Federación', 1.2, C(RED, WHITE), 'Pinilla', 4500], ['Águilas', 'AGU', 'Primera Federación', 1.2, C(WHITE, BLUE), 'El Rubial', 4000],
  ],
  GER: [
    ['Hertha BSC', 'BSC', '2. Bundesliga', 3.9, C(BLUE, WHITE), 'Olympiastadion', 74649], ['VfL Wolfsburg', 'WOB', '2. Bundesliga', 4.5, C(GREEN, WHITE), 'Volkswagen Arena', 30000],
    ['FC St. Pauli', 'STP', '2. Bundesliga', 4.0, C('#6b4226', WHITE), 'Millerntor-Stadion', 29546], ['1. FC Heidenheim', 'FCH', '2. Bundesliga', 3.9, C(RED, BLUE), 'Voith-Arena', 15000],
    ['Hannover 96', 'H96', '2. Bundesliga', 3.6, C(RED, BLACK), 'Heinz von Heiden Arena', 49000], ['1. FC Kaiserslautern', 'FCK', '2. Bundesliga', 3.6, C(RED, WHITE), 'Fritz-Walter-Stadion', 49327],
    ['1. FC Nürnberg', 'FCN', '2. Bundesliga', 3.5, C(RED, BLACK), 'Max-Morlock-Stadion', 49923], ['Karlsruher SC', 'KSC', '2. Bundesliga', 3.4, C(BLUE, WHITE), 'BBBank Wildpark', 34302],
    ['Fortuna Düsseldorf', 'F95', '3. Liga', 2.9, C(RED, WHITE), 'Merkur Spiel-Arena', 54600], ['Holstein Kiel', 'KSV', '2. Bundesliga', 3.5, C(BLUE, WHITE), 'Holstein-Stadion', 15034],
    ['VfL Bochum', 'BOC', '2. Bundesliga', 3.5, C(BLUE, WHITE), 'Vonovia Ruhrstadion', 26000], ['Darmstadt 98', 'SVD', '2. Bundesliga', 3.4, C(BLUE, WHITE), 'Böllenfalltor', 17650],
    ['1. FC Magdeburg', 'FCM', '2. Bundesliga', 3.3, C(BLUE, WHITE), 'Avnet Arena', 30098], ['Arminia Bielefeld', 'DSC', '2. Bundesliga', 3.2, C(BLUE, BLACK), 'Schüco-Arena', 27332],
    ['Greuther Fürth', 'SGF', '2. Bundesliga', 3.1, C(GREEN, WHITE), 'Sportpark Ronhof', 16626], ['Eintracht Braunschweig', 'EBS', '2. Bundesliga', 3.0, C(YELLOW, BLUE), 'Eintracht-Stadion', 23325],
    ['Dynamo Dresden', 'SGD', '2. Bundesliga', 3.0, C(YELLOW, BLACK), 'Rudolf-Harbig-Stadion', 32249], ['Energie Cottbus', 'FCE', '2. Bundesliga', 2.9, C(RED, WHITE), 'LEAG Energie Stadion', 22528],
    ['VfL Osnabrück', 'OSN', '2. Bundesliga', 2.8, C(PURPLE, WHITE), 'Bremer Brücke', 15741], ['Preußen Münster', 'SCP', '3. Liga', 2.5, C(BLACK, WHITE), 'LVM-Preußenstadion', 14300],
    ['Waldhof Mannheim', 'SVW', '3. Liga', 2.3, C(BLUE, BLACK), 'Carl-Benz-Stadion', 24302], ['Hansa Rostock', 'FCH', '3. Liga', 2.4, C(BLUE, WHITE), 'Ostseestadion', 29000],
    ['Wehen Wiesbaden', 'SVWW', '3. Liga', 2.3, C(RED, BLACK), 'BRITA-Arena', 15295], ['1. FC Saarbrücken', 'FCS', '3. Liga', 2.3, C(BLUE, BLACK), 'Ludwigsparkstadion', 16003],
    ['Viktoria Köln', 'VIK', '3. Liga', 2.1, C(RED, WHITE), 'Sportpark Höhenberg', 8343], ['MSV Duisburg', 'MSV', '3. Liga', 2.3, C(BLUE, WHITE), 'Schauinsland-Reisen-Arena', 31514],
    ['Rot-Weiss Essen', 'RWE', '3. Liga', 2.3, C(RED, WHITE), 'Stadion an der Hafenstraße', 19962], ['SC Verl', 'VER', '3. Liga', 2.1, C(BLACK, WHITE), 'Sportclub Arena', 5207],
    ['Würzburger Kickers', 'FWK', '3. Liga', 2.0, C(RED, WHITE), 'Akon Arena', 13090], ['Sonnenhof Großaspach', 'SGS', '3. Liga', 1.9, C(BLACK, WHITE), 'WIRmachenDRUCK Arena', 10001],
    ['Alemannia Aachen', 'AAC', '3. Liga', 2.2, C(BLACK, YELLOW), 'Tivoli', 32960], ['FC Ingolstadt', 'FCI', '3. Liga', 2.2, C(BLACK, RED), 'Audi Sportpark', 15200],
    ['Erzgebirge Aue', 'AUE', 'Regionalliga', 1.6, C(PURPLE, WHITE), 'Erzgebirgsstadion', 15711], ['1860 Munich', 'TSV', 'Regionalliga', 1.7, C(SKY, WHITE), 'Grünwalder Stadion', 15000],
    ['Carl Zeiss Jena', 'FCC', 'Regionalliga', 1.4, C(BLUE, YELLOW), 'Ernst-Abbe-Sportfeld', 15000], ['Hallescher FC', 'HFC', 'Regionalliga', 1.3, C(RED, WHITE), 'Leuna-Chemie-Stadion', 15057],
    ['SSV Jeddeloh II', 'JED', 'Oberliga', 0.8, C(RED, WHITE), 'Sportpark Jeddeloh', 2500], ['SC St. Tönis', 'STT', 'Oberliga', 0.7, C(BLUE, WHITE), 'Sportpark St. Tönis', 3000],
    ['SV Hemelingen', 'HEM', 'Bremen-Liga', 0.5, C(BLUE, WHITE), 'Weserstadion Platz 11', 5000], ['Lüneburger SK', 'LSK', 'Oberliga', 0.7, C(BLUE, WHITE), 'Wilschenbruch', 3000],
    ['Eintracht Trier', 'SVE', 'Oberliga', 0.8, C(BLUE, WHITE), 'Moselstadion', 10256], ['TSV Schott Mainz', 'TSM', 'Oberliga', 0.7, C(BLUE, WHITE), 'Sportplatz am Hartenberg', 2500],
    ['VfB Krieschow', 'KRI', 'Oberliga', 0.5, C(BLUE, WHITE), 'Sportplatz Krieschow', 1500], ['Bahlinger SC', 'BSC', 'Oberliga', 0.7, C(BLACK, WHITE), 'Kaiserstuhlstadion', 4000],
    ['Westfalia Rhynern', 'RHY', 'Oberliga', 0.6, C(RED, WHITE), 'Papenloh', 2000], ['Phönix Lübeck', 'PHL', 'Regionalliga', 0.9, C(RED, WHITE), 'Flugplatz Blankensee', 2000],
    ['VSG Altglienicke', 'ALT', 'Regionalliga', 0.9, C(RED, BLUE), 'Friedrich-Ludwig-Jahn-Sportpark', 19708], ['HEBC Hamburg', 'HEB', 'Oberliga', 0.5, C(RED, WHITE), 'Sportplatz Brucknerstraße', 1500],
  ],
  ITA: [
    ['Hellas Verona', 'VER', 'Serie B', 3.8, C(YELLOW, BLUE), 'Bentegodi', 39211], ['Pisa', 'PIS', 'Serie B', 3.6, C(BLACK, BLUE), 'Arena Garibaldi', 12508],
    ['Cremonese', 'CRE', 'Serie B', 3.5, C(GREY, RED), 'Giovanni Zini', 20641], ['Sampdoria', 'SAM', 'Serie B', 3.2, C(BLUE, WHITE), 'Luigi Ferraris', 33205],
    ['Palermo', 'PAL', 'Serie B', 3.5, C('#f6a6c1', BLACK), 'Renzo Barbera', 36365], ['Empoli', 'EMP', 'Serie B', 3.3, C(BLUE, WHITE), 'Carlo Castellani', 16284],
    ['Modena', 'MOD', 'Serie B', 3.0, C(YELLOW, BLUE), 'Alberto Braglia', 21151], ['Cesena', 'CES', 'Serie B', 2.9, C(WHITE, BLACK), 'Dino Manuzzi', 20194],
    ['Catanzaro', 'CTZ', 'Serie B', 3.0, C(YELLOW, RED), 'Nicola Ceravolo', 14650], ['Südtirol', 'SUD', 'Serie B', 2.8, C(WHITE, RED), 'Marco Druso', 5539],
    ['Padova', 'PAD', 'Serie B', 2.8, C(WHITE, RED), 'Euganeo', 32420], ['Mantova', 'MAN', 'Serie B', 2.9, C(WHITE, RED), 'Danilo Martelli', 14884],
    ['Carrarese', 'CAR', 'Serie B', 2.7, C(YELLOW, BLUE), 'Stadio dei Marmi', 4194], ['Juve Stabia', 'JST', 'Serie B', 2.7, C(YELLOW, BLUE), 'Romeo Menti', 7642],
    ['Avellino', 'AVE', 'Serie B', 2.7, C(GREEN, WHITE), 'Partenio-Adriano Lombardi', 26000], ['Virtus Entella', 'ENT', 'Serie B', 2.6, C(WHITE, SKY), 'Stadio Comunale', 5535],
    ['Vicenza', 'VIC', 'Serie B', 2.7, C(RED, WHITE), 'Romeo Menti', 12000], ['Arezzo', 'ARE', 'Serie B', 2.5, C(MAROON, WHITE), 'Città di Arezzo', 13128],
    ['Benevento', 'BEN', 'Serie B', 2.7, C(YELLOW, RED), 'Ciro Vigorito', 16867], ['Ascoli', 'ASC', 'Serie B', 2.5, C(BLACK, WHITE), 'Cino e Lillo Del Duca', 12461],
    ['Catania', 'CAT', 'Serie C', 2.0, C(RED, BLUE), 'Angelo Massimino', 20881], ['Union Brescia', 'BRE', 'Serie C', 1.9, C(BLUE, WHITE), 'Mario Rigamonti', 19550],
    ['Potenza', 'POT', 'Serie C', 1.6, C(RED, BLUE), 'Alfredo Viviani', 5500], ['Ravenna', 'RAV', 'Serie C', 1.6, C(RED, BLUE), 'Bruno Benelli', 12020],
  ],
  FRA: [
    ['Nantes', 'FCN', 'Ligue 2', 3.8, C(YELLOW, GREEN), 'Stade de la Beaujoire', 35322], ['Metz', 'FCM', 'Ligue 2', 3.3, C(MAROON, WHITE), 'Saint-Symphorien', 28786],
    ['Saint-Étienne', 'ASSE', 'Ligue 2', 3.4, C(GREEN, WHITE), 'Geoffroy-Guichard', 41965], ['Montpellier', 'MHSC', 'Ligue 2', 3.1, C(ORANGE, BLUE), 'Stade de la Mosson', 32900],
    ['Reims', 'SDR', 'Ligue 2', 3.2, C(RED, WHITE), 'Auguste-Delaune', 21029], ['Guingamp', 'EAG', 'Ligue 2', 2.8, C(RED, BLACK), 'Roudourou', 18378],
    ['Annecy', 'FCA', 'Ligue 2', 2.6, C(RED, WHITE), 'Parc des Sports', 15660], ['Clermont', 'CF63', 'Ligue 2', 2.7, C(RED, BLUE), 'Gabriel-Montpied', 11980],
    ['Dijon', 'DFCO', 'Ligue 2', 2.6, C(RED, WHITE), 'Gaston Gérard', 15995], ['Sochaux', 'FCSM', 'Ligue 2', 2.6, C(YELLOW, BLUE), 'Auguste-Bonal', 20005],
    ['Grenoble', 'GF38', 'Ligue 2', 2.6, C(BLUE, WHITE), 'Stade des Alpes', 20068], ['Laval', 'SL53', 'Ligue 2', 2.5, C(ORANGE, BLACK), 'Francis Le Basser', 18607],
    ['Red Star', 'RSFC', 'Ligue 2', 2.6, C(GREEN, WHITE), 'Stade Bauer', 10000], ['Nancy', 'ASNL', 'Ligue 2', 2.5, C(RED, WHITE), 'Marcel Picot', 20087],
    ['Pau', 'PFC', 'Ligue 2', 2.4, C(YELLOW, BLUE), 'Nouste Camp', 4031], ['Rodez', 'RAF', 'Ligue 2', 2.4, C(RED, YELLOW), 'Paul-Lignon', 5955],
    ['Boulogne', 'USBCO', 'Ligue 2', 2.3, C(RED, BLACK), 'Stade de la Libération', 9534], ['Dunkerque', 'USLD', 'Ligue 2', 2.4, C(BLUE, WHITE), 'Marcel-Tribut', 4933],
    ['Bastia', 'SCB', 'Ligue 3', 2.0, C(BLUE, WHITE), 'Armand-Cesari', 16048], ['Amiens', 'ASC', 'Ligue 3', 2.0, C(WHITE, BLACK), 'Stade de la Licorne', 12097],
    ['Caen', 'SMC', 'Ligue 3', 2.0, C(BLUE, RED), "Michel d'Ornano", 21215], ['Valenciennes', 'VAFC', 'Ligue 3', 1.8, C(RED, WHITE), 'Stade du Hainaut', 25172],
    ['Orléans', 'USO', 'Ligue 3', 1.7, C(YELLOW, BLUE), 'Stade de la Source', 7000], ['Versailles', 'FCV', 'Ligue 3', 1.6, C(BLUE, WHITE), 'Montbauron', 7545],
    ['Rouen', 'FCR', 'Ligue 3', 1.7, C(RED, WHITE), 'Robert Diochon', 8372], ['Quevilly-Rouen', 'QRM', 'Ligue 3', 1.6, C(YELLOW, BLACK), 'Robert Diochon', 8372],
    ['Cannes', 'ASC', 'Ligue 3', 1.5, C(RED, WHITE), 'Pierre de Coubertin', 9819], ['Concarneau', 'USC', 'Ligue 3', 1.5, C(BLUE, RED), 'Guy-Piriou', 5800],
    ['Bourg-Péronnas', 'FBBP', 'Ligue 3', 1.5, C(RED, WHITE), 'Marcel-Verchère', 11400], ['Le Puy', 'LPF', 'Ligue 3', 1.4, C(BLUE, WHITE), 'Charles Massot', 4800],
    ['Nîmes', 'NO', 'National 1', 1.2, C(RED, WHITE), 'Stade des Antonins', 8000], ['Châteauroux', 'LBC', 'National 1', 1.2, C(BLUE, WHITE), 'Gaston-Petit', 17000],
    ['US Créteil', 'USCL', 'National 1', 1.0, C(BLUE, YELLOW), 'Dominique-Duvauchelle', 12000], ['SC Toulon', 'SCT', 'National 1', 0.9, C(YELLOW, BLUE), 'Bon-Rencontre', 8200],
    ['Les Herbiers', 'VHF', 'National 1', 0.8, C(RED, BLACK), 'Massabielle', 5000], ['Stade Briochin', 'SB', 'National 1', 1.0, C(RED, WHITE), 'Fred-Aubert', 13500],
    // Amateur clubs from National 2 and below (the Coupe de France reaches deep into the pyramid).
    ['Sedan', 'CSSA', 'National 2', 0.7, C(RED, GREEN), 'Stade Louis-Dugauguez', 23189], ['Fleury', 'FFC', 'National 2', 0.6, C(BLUE, WHITE), 'Stade Walter Felder', 3000],
    ['Chambly', 'FCCO', 'National 2', 0.6, C(BLUE, BLACK), 'Stade Pierre Brisson', 5000], ['Avranches', 'USA', 'National 2', 0.6, C(RED, WHITE), 'Stade René Fenouillère', 2500],
    ['Villefranche', 'FCVB', 'National 2', 0.6, C(BLUE, WHITE), 'Stade Armand-Chouffet', 3200], ['Aubagne', 'AFC', 'National 2', 0.6, C(YELLOW, BLUE), 'Stade de Lattre', 2000],
    ['Épinal', 'SAS', 'National 2', 0.6, C(RED, WHITE), 'Stade de la Colombière', 7000], ['Bourges', 'BF18', 'National 2', 0.5, C(BLUE, WHITE), 'Stade Jacques-Rimbault', 7500],
    ['Blois', 'BF41', 'National 2', 0.5, C(BLUE, WHITE), 'Stade Jules-Ladoumègue', 3000], ['Chamalières', 'FCC', 'National 2', 0.5, C(RED, WHITE), 'Stade Claude-Wolff', 2000],
    ['Thionville Lusitanos', 'TLFC', 'National 2', 0.4, C(RED, GREEN), 'Stade du Lusitanos', 1500], ['Saint-Priest', 'ASSP', 'National 2', 0.4, C(BLUE, WHITE), 'Stade Jacques-Joly', 2000],
  ],
  POR: [
    ['Tondela', 'TON', 'Liga Portugal 2', 2.2, C(GREEN, YELLOW), 'João Cardoso', 5000], ['AFS', 'AFS', 'Liga Portugal 2', 2.2, C(RED, WHITE), 'Estádio do CD Aves', 6230],
    ['Académica', 'ACA', 'Liga Portugal 2', 1.9, C(BLACK, WHITE), 'Cidade de Coimbra', 29622], ['Chaves', 'CHA', 'Liga Portugal 2', 2.0, C(BLUE, RED), 'Eng. Manuel Branco Teixeira', 8400],
    ['Farense', 'FAR', 'Liga Portugal 2', 2.0, C(BLACK, WHITE), 'São Luís', 7000], ['Feirense', 'FEI', 'Liga Portugal 2', 1.8, C(BLUE, WHITE), 'Marcolino Castro', 5401],
    ['Leixões', 'LEI', 'Liga Portugal 2', 1.8, C(RED, WHITE), 'Estádio do Mar', 6000], ['Portimonense', 'POR', 'Liga Portugal 2', 1.9, C(BLACK, WHITE), 'Municipal de Portimão', 4961],
    ['União de Leiria', 'UDL', 'Liga Portugal 2', 1.9, C(BLACK, WHITE), 'Dr. Magalhães Pessoa', 23888], ['Vizela', 'VIZ', 'Liga Portugal 2', 1.9, C(BLUE, WHITE), 'Estádio do FC Vizela', 6000],
    ['Penafiel', 'PEN', 'Liga Portugal 2', 1.7, C(RED, BLACK), '25 de Abril', 5230], ['Felgueiras', 'FEL', 'Liga Portugal 2', 1.6, C(BLUE, WHITE), 'Dr. Machado de Matos', 7540],
    ['Amarante', 'AMA', 'Liga Portugal 2', 1.6, C(WHITE, BLACK), 'Municipal de Amarante', 5000], ['Lusitânia Lourosa', 'LOU', 'Liga Portugal 2', 1.6, C(RED, WHITE), 'Lusitânia de Lourosa', 4900],
    ['Torreense', 'TOR', 'Liga Portugal 2', 2.3, C(MAROON, WHITE), 'Manuel Marques', 2431], ['Benfica B', 'SLBB', 'Liga Portugal 2', 1.9, C(RED, WHITE), 'Benfica Campus', 2644],
    ['Porto B', 'FCPB', 'Liga Portugal 2', 1.9, C(BLUE, WHITE), 'Luís Filipe Menezes', 3800], ['Sporting CP B', 'SCPB', 'Liga Portugal 2', 1.8, C(GREEN, WHITE), 'Aurélio Pereira', 1180],
    ['Paços de Ferreira', 'PAC', 'Liga 3', 1.5, C(YELLOW, GREEN), 'Capital do Móvel', 8976], ['Belenenses', 'BEL', 'Liga 3', 1.3, C(BLUE, WHITE), 'Restelo', 19856],
    ['Varzim', 'VAR', 'Liga 3', 1.2, C(RED, WHITE), 'Estádio do Varzim SC', 7280], ['Oliveirense', 'OLI', 'Liga 3', 1.3, C(RED, BLACK), 'Carlos Osório', 1625],
    ['Trofense', 'TRO', 'Liga 3', 1.1, C(RED, WHITE), 'Estádio do CD Trofense', 5017], ['Sp. Covilhã', 'COV', 'Liga 3', 1.1, C(BLACK, WHITE), 'José dos Santos Pinto', 3500],
    ['Mafra', 'MAF', 'Liga 3', 1.2, C(RED, WHITE), 'Municipal de Mafra', 1249], ['Leça', 'LEC', 'Liga 3', 1.0, C(RED, WHITE), 'Estádio do Leça FC', 4529],
    ['Fafe', 'FAF', 'Liga 3', 1.0, C(RED, WHITE), 'Municipal de Fafe', 4000], ['Paredes', 'PAR', 'Liga 3', 0.9, C(BLUE, WHITE), 'Laranjeiras', 3000],
    ['Caldas', 'CAL', 'Liga 3', 1.0, C(YELLOW, BLUE), 'Campo da Mata', 5700], ['Atlético CP', 'ATL', 'Liga 3', 0.9, C(BLUE, YELLOW), 'Tapadinha', 4000],
    ['Louletano', 'LOL', 'Liga 3', 0.9, C(RED, WHITE), 'Estádio Algarve', 22000], ['Lusitano Évora', 'LEV', 'Liga 3', 0.8, C(GREEN, WHITE), 'Campo Estrela', 4000],
    ['Marco 09', 'MAR', 'Liga 3', 0.8, C(RED, BLACK), 'Municipal do Marco', 6000], ['São João de Ver', 'SJV', 'Liga 3', 0.8, C(BLUE, WHITE), 'SC São João de Ver', 5000],
    ['Vianense', 'VIA', 'Liga 3', 0.8, C(RED, BLACK), 'Dr. José de Matos', 3000], ['Vitória de Sernache', 'SER', 'Liga 3', 0.7, C(GREEN, WHITE), 'D. Nuno Álvares Pereira', 2500],
    ['União de Santarém', 'SAN', 'Liga 3', 0.7, C(GREEN, WHITE), 'Chã das Padeiras', 2167], ['Beira-Mar', 'BMA', 'Campeonato de Portugal', 0.6, C(BLACK, YELLOW), 'Municipal de Aveiro', 30000],
    ['Salgueiros', 'SAL', 'Campeonato de Portugal', 0.5, C(RED, WHITE), 'Estádio Engenheiro Vidal Pinheiro', 3000], ['Amora', 'AMO', 'Campeonato de Portugal', 0.5, C(BLUE, WHITE), 'Estádio da Medideira', 3000],
    ['Sanjoanense', 'SJN', 'Campeonato de Portugal', 0.5, C(BLACK, WHITE), 'Conde Dias Garcia', 5000], ['Braga B', 'SCBB', 'Campeonato de Portugal', 0.6, C(RED, WHITE), 'Estádio 1.º de Maio', 28000],
  ],
};

/** Serie C: the pool below Serie B, filled out from the four clubs listed above. */
LOWER.ITA.push(
  ['Ternana', 'TER', 'Serie C', 1.9, C(RED, GREEN), 'Stadio Libero Liberati', 22000], ['Perugia', 'PER', 'Serie C', 2.0, C(RED, WHITE), 'Stadio Renato Curi', 23625],
  ['SPAL', 'SPA', 'Serie C', 1.8, C(SKY, WHITE), 'Stadio Paolo Mazza', 16134], ['Triestina', 'TRI', 'Serie C', 1.7, C(MAROON, WHITE), 'Stadio Nereo Rocco', 26500],
  ['Novara', 'NOV', 'Serie C', 1.7, C(SKY, WHITE), 'Stadio Silvio Piola', 17875], ['Lucchese', 'LUC', 'Serie C', 1.4, C(RED, BLACK), 'Stadio Porta Elisa', 7386],
  ['Crotone', 'CRO', 'Serie C', 1.8, C(RED, BLUE), 'Stadio Ezio Scida', 16547], ['Foggia', 'FOG', 'Serie C', 1.8, C(RED, BLACK), 'Stadio Pino Zaccheria', 25000],
  ['Cosenza', 'COS', 'Serie C', 1.8, C(RED, BLUE), 'Stadio Gigi Marulla', 24479], ['Salernitana', 'SAL', 'Serie C', 2.1, C(MAROON, WHITE), 'Stadio Arechi', 37800],
  ['Cittadella', 'CIT', 'Serie C', 1.9, C(MAROON, WHITE), 'Stadio Pier Cesare Tombolato', 7623], ['Pescara', 'PES', 'Serie C', 1.8, C(SKY, WHITE), 'Stadio Adriatico', 20515],
  ['Reggiana', 'REG', 'Serie C', 2.0, C(MAROON, WHITE), 'Mapei Stadium', 21584], ['Bari', 'BAR', 'Serie C', 2.2, C(WHITE, RED), 'Stadio San Nicola', 58270],
  ['Spezia', 'SPE', 'Serie C', 2.1, C(WHITE, BLACK), 'Stadio Alberto Picco', 10336], ['Rimini', 'RIM', 'Serie C', 1.3, C(RED, WHITE), 'Stadio Romeo Neri', 9768],
  ['Sambenedettese', 'SAM', 'Serie C', 1.5, C(RED, BLUE), 'Stadio Riviera delle Palme', 12000], ['Torres', 'TOR', 'Serie C', 1.5, C(RED, BLUE), 'Stadio Vanni Sanna', 12000],
  ['Trapani', 'TRA', 'Serie C', 1.6, C(MAROON, WHITE), 'Stadio Provinciale', 7500], ['Latina', 'LAT', 'Serie C', 1.4, C(BLUE, BLACK), 'Stadio Domenico Francioni', 9000],
  ['Lecco', 'LEC', 'Serie C', 1.5, C(BLUE, WHITE), 'Stadio Rigamonti-Ceppi', 4993], ['Gubbio', 'GUB', 'Serie C', 1.3, C(RED, BLUE), 'Stadio Pietro Barbetti', 5300],
);

/** Clubs from the rest of Europe in the 2026/27 UEFA competitions: [name, short, country, tier, colours, stadium, capacity]. */
export const FOREIGN: [string, string, string, number, [string, string], string, number][] = [
  ['AEK Athens', 'AEK', 'GRE', 5.5, C(YELLOW, BLACK), 'OPAP Arena', 32500], ['Bodø/Glimt', 'BOD', 'NOR', 5.6, C(YELLOW, BLACK), 'Aspmyra Stadion', 8270],
  ['Club Brugge', 'BRU', 'BEL', 6.3, C(BLUE, BLACK), 'Jan Breydelstadion', 29000], ['Fenerbahçe', 'FEN', 'TUR', 6.8, C(YELLOW, NAVY), 'Şükrü Saracoğlu', 47800],
  ['Feyenoord', 'FEY', 'NED', 6.4, C(RED, WHITE), 'De Kuip', 47500], ['Galatasaray', 'GAL', 'TUR', 6.9, C(RED, YELLOW), 'Rams Park', 52200],
  ['LASK', 'LAS', 'AUT', 4.3, C(BLACK, WHITE), 'Raiffeisen Arena', 19000], ['PSV', 'PSV', 'NED', 6.8, C(RED, WHITE), 'Philips Stadion', 35000],
  ['Slovan Bratislava', 'SLO', 'SVK', 4.3, C(SKY, WHITE), 'Tehelné pole', 22500], ['Sabah', 'SAB', 'AZE', 3.6, C(NAVY, WHITE), 'Bank Respublika Arena', 8500],
  ['Shakhtar Donetsk', 'SHA', 'UKR', 5.8, C(ORANGE, BLACK), 'Arena Lviv', 34915], ['Slavia Prague', 'SLA', 'CZE', 5.4, C(RED, WHITE), 'Fortuna Arena', 19370],
  ['Viking', 'VIK', 'NOR', 4.2, C(NAVY, WHITE), 'SR-Bank Arena', 15900],
  ['Anderlecht', 'AND', 'BEL', 5.6, C(PURPLE, WHITE), 'Lotto Park', 21500], ['Ararat-Armenia', 'ARA', 'ARM', 3.0, C(RED, WHITE), 'Republican Stadium', 14400],
  ['AZ Alkmaar', 'AZ', 'NED', 5.8, C(RED, WHITE), 'AFAS Stadion', 19500], ['Beşiktaş', 'BJK', 'TUR', 6.2, C(BLACK, WHITE), 'Tüpraş Stadyumu', 42600],
  ['Celje', 'CEL', 'SVN', 3.4, C(YELLOW, BLUE), 'Stadion Z\'dežele', 13000], ['Celtic', 'CLT', 'SCO', 5.9, C(GREEN, WHITE), 'Celtic Park', 60400],
  ['Ferencváros', 'FTC', 'HUN', 4.8, C(GREEN, WHITE), 'Groupama Aréna', 22000], ['Dinamo Zagreb', 'DZG', 'CRO', 5.2, C(BLUE, WHITE), 'Maksimir', 24800],
  ['Hapoel Beer-Sheva', 'HBS', 'ISR', 3.9, C(RED, WHITE), 'Turner Stadium', 16100], ['Jagiellonia Białystok', 'JAG', 'POL', 4.0, C(RED, YELLOW), 'Stadion Miejski', 22400],
  ['Lech Poznań', 'LPO', 'POL', 4.3, C(BLUE, WHITE), 'Enea Stadion', 42800], ['Levski Sofia', 'LEV', 'BUL', 3.5, C(BLUE, WHITE), 'Georgi Asparuhov', 25000],
  ['Lillestrøm', 'LSK', 'NOR', 3.5, C(YELLOW, BLACK), 'Åråsen Stadion', 12000], ['NEC Nijmegen', 'NEC', 'NED', 4.6, C(RED, GREEN), 'Goffertstadion', 12500],
  ['OFI Crete', 'OFI', 'GRE', 3.4, C(BLACK, WHITE), 'Theodoros Vardinogiannis', 9000], ['Olympiacos', 'OLY', 'GRE', 6.2, C(RED, WHITE), 'Karaiskakis', 32100],
  ['Omonia Nicosia', 'OMO', 'CYP', 3.9, C(GREEN, WHITE), 'GSP Stadium', 22859], ['Red Bull Salzburg', 'RBS', 'AUT', 5.8, C(WHITE, RED), 'Red Bull Arena', 17200],
  ['Sparta Prague', 'SPA', 'CZE', 5.3, C(MAROON, WHITE), 'Letná', 18900], ['Sturm Graz', 'STU', 'AUT', 4.8, C(BLACK, WHITE), 'Merkur Arena', 15300],
  ['Union SG', 'USG', 'BEL', 5.3, C(YELLOW, BLUE), 'Stade Joseph Marien', 9400], ['Viktoria Plzeň', 'PLZ', 'CZE', 4.8, C(RED, BLUE), 'Doosan Arena', 11700],
  ['Aarhus', 'AGF', 'DEN', 4.0, C(WHITE, BLUE), 'Ceres Park', 20000], ['Ajax', 'AJA', 'NED', 6.6, C(WHITE, RED), 'Johan Cruyff Arena', 55500],
  ['Borac Banja Luka', 'BOR', 'BIH', 2.6, C(RED, BLUE), 'Gradski stadion', 9730], ['Brann', 'BRA', 'NOR', 4.3, C(RED, WHITE), 'Brann Stadion', 17700],
  ['Copenhagen', 'FCK', 'DEN', 5.4, C(WHITE, BLUE), 'Parken', 38000], ['Red Star Belgrade', 'CZV', 'SRB', 5.4, C(RED, WHITE), 'Rajko Mitić', 51700],
  ['CSKA Sofia', 'CSK', 'BUL', 3.6, C(RED, WHITE), 'Balgarska Armia', 22000], ['Egnatia', 'EGN', 'ALB', 2.2, C(BLUE, WHITE), 'Egnatia Arena', 4000],
  ['Gent', 'GNT', 'BEL', 4.9, C(BLUE, WHITE), 'Ghelamco Arena', 20000], ['Hajduk Split', 'HAJ', 'CRO', 4.5, C(WHITE, BLUE), 'Poljud', 33000],
  ['Hearts', 'HEA', 'SCO', 4.0, C(MAROON, WHITE), 'Tynecastle Park', 19800], ['Iberia 1999', 'IBE', 'GEO', 2.5, C(BLUE, WHITE), 'Boris Paichadze Arena', 54000],
  ['Inter Club d\'Escaldes', 'ESC', 'AND', 1.4, C(BLUE, WHITE), 'Nou Estadi Encamp', 5108], ['Jablonec', 'JAB', 'CZE', 3.5, C(GREEN, WHITE), 'Stadion Střelnice', 6280],
  ['Kairat Almaty', 'KAI', 'KAZ', 3.2, C(YELLOW, BLACK), 'Central Stadium', 23800], ['Kauno Žalgiris', 'KZA', 'LTU', 2.4, C(GREEN, WHITE), 'Darius and Girėnas Stadium', 15000],
  ['KuPS Kuopio', 'KUP', 'FIN', 2.9, C(YELLOW, BLACK), 'Väre Areena', 5000], ['Lincoln Red Imps', 'LRI', 'GIB', 1.5, C(RED, WHITE), 'Europa Point Stadium', 8000],
  ['Lugano', 'LUG', 'SUI', 4.0, C(BLACK, WHITE), 'Cornaredo', 6300], ['Midtjylland', 'FCM', 'DEN', 5.0, C(BLACK, RED), 'MCH Arena', 11800],
  ['Mjällby', 'MJA', 'SWE', 3.0, C(YELLOW, BLACK), 'Strandvallen', 7500], ['Nordsjælland', 'FCN', 'DEN', 4.0, C(RED, WHITE), 'Right to Dream Park', 10300],
  ['Pafos', 'PAF', 'CYP', 3.8, C(BLUE, WHITE), 'Alphamega Stadium', 10000], ['Panathinaikos', 'PAO', 'GRE', 5.2, C(GREEN, WHITE), 'Apostolos Nikolaidis', 16000],
  ['Riga FC', 'RIG', 'LVA', 2.5, C(BLUE, WHITE), 'Skonto Stadium', 8207], ['Sint-Truiden', 'STV', 'BEL', 3.9, C(YELLOW, BLUE), 'Stayen', 14600],
  ['Thun', 'THU', 'SUI', 3.4, C(RED, WHITE), 'Stockhorn Arena', 10000], ['Trabzonspor', 'TS', 'TUR', 5.2, C(CLARET, SKY), 'Papara Park', 40800],
  ['Twente', 'TWE', 'NED', 5.0, C(RED, WHITE), 'De Grolsch Veste', 30200], ['Universitatea Craiova', 'UCR', 'ROU', 3.6, C(BLUE, WHITE), 'Ion Oblemenco', 30900],
];

/** Names used in the sources, mapped to the names in the game. */
export const ALIASES: Record<string, string> = {
  Atleti: 'Atlético Madrid', 'B. Dortmund': 'Borussia Dortmund', 'Man City': 'Manchester City', 'Man United': 'Manchester United',
  Paris: 'Paris Saint-Germain', 'Bayern München': 'Bayern Munich', Bayern: 'Bayern Munich', Inter: 'Inter Milan', Leipzig: 'RB Leipzig', 'RB Leipzig': 'RB Leipzig',
  Stuttgart: 'VfB Stuttgart', Milan: 'AC Milan', Leverkusen: 'Bayer Leverkusen', Hoffenheim: 'TSG Hoffenheim', Celta: 'Celta Vigo',
  Brighton: 'Brighton & Hove Albion', Freiburg: 'SC Freiburg', 'S. Bratislava': 'Slovan Bratislava', Shakhtar: 'Shakhtar Donetsk',
  'Slavia Praha': 'Slavia Prague', 'Sparta Praha': 'Sparta Prague', 'GNK Dinamo': 'Dinamo Zagreb', 'H. Beer-Sheva': 'Hapoel Beer-Sheva',
  Jagiellonia: 'Jagiellonia Białystok', 'N.E.C.': 'NEC Nijmegen', Omonia: 'Omonia Nicosia', Salzburg: 'Red Bull Salzburg',
  Borac: 'Borac Banja Luka', 'Crvena Zvezda': 'Red Star Belgrade', 'Iberia Tbilisi': 'Iberia 1999', 'Inter Escaldes': "Inter Club d'Escaldes",
  'L. Red Imps': 'Lincoln Red Imps', Riga: 'Riga FC', 'Sint-Truidense': 'Sint-Truiden', 'U. Craiova': 'Universitatea Craiova',
  Frankfurt: 'Eintracht Frankfurt', Karlsruhe: 'Karlsruher SC', Kaiserslautern: '1. FC Kaiserslautern', Augsburg: 'FC Augsburg',
  Hannover: 'Hannover 96', Hertha: 'Hertha BSC', 'Nürnberg': '1. FC Nürnberg', Elversberg: 'SV Elversberg', 'SG Sonnenhof Großaspach': 'Sonnenhof Großaspach',
  Heidenheim: '1. FC Heidenheim', 'Bochum': 'VfL Bochum', Braunschweig: 'Eintracht Braunschweig', Gladbach: 'Borussia Mönchengladbach',
  Darmstadt: 'Darmstadt 98', Magdeburg: '1. FC Magdeburg', 'St. Pauli': 'FC St. Pauli', Paderborn: 'SC Paderborn', Wolfsburg: 'VfL Wolfsburg',
  'Köln': '1. FC Köln', Schalke: 'Schalke 04', Dortmund: 'Borussia Dortmund', 'Osnabrück': 'VfL Osnabrück', '1860 München': '1860 Munich',
  'Saarbrücken': '1. FC Saarbrücken', Duisburg: 'MSV Duisburg', Verona: 'Hellas Verona', HSV: 'Hamburger SV', Union: 'Union Berlin', Bremen: 'Werder Bremen',
  Mainz: 'Mainz 05', 'Werder Bremen': 'Werder Bremen',
};

/** A UEFA league phase: each club's home and away opponents, in the sources' names. */
export type Draw = Record<string, { h: string[]; a: string[] }>;

const d = (h: string, a: string) => ({ h: h.split(', '), a: a.split(', ') });

export const UCL_2026: Draw = {
  'AEK Athens': d('Real Madrid, Roma, Galatasaray, LASK', 'Man City, B. Dortmund, Shakhtar, Como'),
  Arsenal: d('Real Madrid, B. Dortmund, Lille, Sabah', 'Bayern München, Real Betis, Napoli, Slavia Praha'),
  'Aston Villa': d('Paris, B. Dortmund, Fenerbahçe, Viking', 'Barcelona, Club Brugge, Galatasaray, Slavia Praha'),
  Atleti: d('Bayern München, Man United, Fenerbahçe, Viking', 'Liverpool, PSV, Bodø/Glimt, Stuttgart'),
  'B. Dortmund': d('Inter, Real Betis, Villarreal, AEK Athens', 'Arsenal, Aston Villa, Bodø/Glimt, Sabah'),
  Barcelona: d('Man City, Aston Villa, Feyenoord, Como', 'Paris, Sporting CP, Galatasaray, Sabah'),
  'Bayern München': d('Arsenal, Real Betis, Bodø/Glimt, Slavia Praha', 'Atleti, Man United, Lille, Viking'),
  'Bodø/Glimt': d('Atleti, B. Dortmund, Lille, LASK', 'Bayern München, Club Brugge, Napoli, Lens'),
  'Club Brugge': d('Liverpool, Aston Villa, Bodø/Glimt, Lens', 'Inter, PSV, Napoli, Stuttgart'),
  Como: d('Paris, Man United, Leipzig, AEK Athens', 'Barcelona, Real Betis, Feyenoord, Lens'),
  'Fenerbahçe': d('Liverpool, Roma, Villarreal, Slavia Praha', 'Atleti, Aston Villa, Shakhtar, LASK'),
  Feyenoord: d('Inter, Porto, Leipzig, Como', 'Barcelona, Real Betis, Galatasaray, Viking'),
  Galatasaray: d('Barcelona, Aston Villa, Feyenoord, Stuttgart', 'Paris, Sporting CP, Lille, AEK Athens'),
  Inter: d('Liverpool, Club Brugge, Shakhtar, Stuttgart', 'Real Madrid, B. Dortmund, Feyenoord, S. Bratislava'),
  LASK: d('Liverpool, Porto, Fenerbahçe, S. Bratislava', 'Real Madrid, Sporting CP, Bodø/Glimt, AEK Athens'),
  Leipzig: d('Man City, PSV, Shakhtar, Lens', 'Real Madrid, Man United, Feyenoord, Como'),
  Lens: d('Man City, Sporting CP, Bodø/Glimt, Como', 'Liverpool, Club Brugge, Leipzig, Slavia Praha'),
  Lille: d('Bayern München, Real Betis, Galatasaray, S. Bratislava', 'Arsenal, Roma, Bodø/Glimt, Stuttgart'),
  Liverpool: d('Atleti, Porto, Villarreal, Lens', 'Inter, Club Brugge, Fenerbahçe, LASK'),
  'Man City': d('Paris, Sporting CP, Napoli, AEK Athens', 'Barcelona, Porto, Leipzig, Lens'),
  'Man United': d('Bayern München, Roma, Leipzig, Sabah', 'Atleti, Sporting CP, Villarreal, Como'),
  Napoli: d('Arsenal, Club Brugge, Bodø/Glimt, Viking', 'Man City, Porto, Villarreal, Sabah'),
  Paris: d('Barcelona, Roma, Galatasaray, S. Bratislava', 'Man City, Aston Villa, Villarreal, Como'),
  Porto: d('Man City, PSV, Napoli, Slavia Praha', 'Liverpool, Real Betis, Feyenoord, LASK'),
  PSV: d('Atleti, Club Brugge, Shakhtar, Stuttgart', 'Real Madrid, Porto, Leipzig, Viking'),
  'Real Betis': d('Arsenal, Porto, Feyenoord, Como', 'Bayern München, B. Dortmund, Lille, S. Bratislava'),
  'Real Madrid': d('Inter, PSV, Leipzig, LASK', 'Arsenal, Roma, Shakhtar, AEK Athens'),
  Roma: d('Real Madrid, Sporting CP, Lille, S. Bratislava', 'Paris, Man United, Fenerbahçe, AEK Athens'),
  'S. Bratislava': d('Inter, Real Betis, Shakhtar, Stuttgart', 'Paris, Roma, Lille, LASK'),
  Sabah: d('Barcelona, B. Dortmund, Napoli, Slavia Praha', 'Arsenal, Man United, Villarreal, Viking'),
  Shakhtar: d('Real Madrid, Sporting CP, Fenerbahçe, AEK Athens', 'Inter, PSV, Leipzig, S. Bratislava'),
  'Slavia Praha': d('Arsenal, Aston Villa, Villarreal, Lens', 'Bayern München, Porto, Fenerbahçe, Sabah'),
  'Sporting CP': d('Barcelona, Man United, Galatasaray, LASK', 'Man City, Roma, Shakhtar, Lens'),
  Stuttgart: d('Atleti, Club Brugge, Lille, Viking', 'Inter, PSV, Galatasaray, S. Bratislava'),
  Viking: d('Bayern München, PSV, Feyenoord, Sabah', 'Atleti, Aston Villa, Napoli, Stuttgart'),
  Villarreal: d('Paris, Man United, Napoli, Sabah', 'Liverpool, B. Dortmund, Fenerbahçe, Slavia Praha'),
};

export const UEL_2026: Draw = {
  Anderlecht: d('Lyon, Salzburg, Sunderland, Hoffenheim', 'Marseille, GNK Dinamo, Jagiellonia, OFI Crete'),
  'Ararat-Armenia': d('AZ Alkmaar, Sparta Praha, Celje, N.E.C.', 'Milan, Salzburg, Jagiellonia, Torreense'),
  'AZ Alkmaar': d('Juventus, GNK Dinamo, Sturm Graz, H. Beer-Sheva', 'Benfica, Sparta Praha, Sunderland, Ararat-Armenia'),
  Benfica: d('AZ Alkmaar, Celtic, Lech Poznań, OFI Crete', 'Milan, Viktoria Plzeň, Omonia, N.E.C.'),
  'Beşiktaş': d('Marseille, Union SG, Crystal Palace, H. Beer-Sheva', 'Leverkusen, Celtic, Omonia, Hoffenheim'),
  Bournemouth: d('Milan, Viktoria Plzeň, Sturm Graz, H. Beer-Sheva', 'Real Sociedad, Sparta Praha, Celta, Lillestrøm'),
  Celje: d('Olympiacos, Salzburg, Omonia, N.E.C.', 'Leverkusen, Ferencváros, Sturm Graz, Ararat-Armenia'),
  Celta: d('Juventus, Union SG, Bournemouth, Lillestrøm', 'Marseille, Celtic, Omonia, H. Beer-Sheva'),
  Celtic: d('Marseille, Ferencváros, Celta, Beşiktaş', 'Benfica, Union SG, Omonia, Torreense'),
  'Crystal Palace': d('Real Sociedad, Sparta Praha, Lech Poznań, Hoffenheim', 'Lyon, Salzburg, Jagiellonia, Beşiktaş'),
  'Ferencváros': d('Juventus, Viktoria Plzeň, Celje, Torreense', 'Milan, Celtic, Lech Poznań, Hoffenheim'),
  'GNK Dinamo': d('Leverkusen, Anderlecht, Sturm Graz, N.E.C.', 'AZ Alkmaar, Rennes, Sunderland, H. Beer-Sheva'),
  'H. Beer-Sheva': d('Juventus, GNK Dinamo, Celta, OFI Crete', 'AZ Alkmaar, Union SG, Bournemouth, Beşiktaş'),
  Hoffenheim: d('Lyon, Ferencváros, Sturm Graz, Beşiktaş', 'Olympiacos, Anderlecht, Crystal Palace, OFI Crete'),
  Jagiellonia: d('Lyon, Anderlecht, Crystal Palace, Ararat-Armenia', 'Olympiacos, Viktoria Plzeň, Sunderland, Levski Sofia'),
  Juventus: d('Real Sociedad, Rennes, Omonia, N.E.C.', 'AZ Alkmaar, Ferencváros, Celta, H. Beer-Sheva'),
  'Lech Poznań': d('Leverkusen, Ferencváros, Sunderland, Torreense', 'Benfica, Union SG, Crystal Palace, OFI Crete'),
  Leverkusen: d('Marseille, Salzburg, Celje, Beşiktaş', 'Lyon, GNK Dinamo, Lech Poznań, OFI Crete'),
  'Levski Sofia': d('Milan, Salzburg, Jagiellonia, Lillestrøm', 'Marseille, Viktoria Plzeň, Sunderland, N.E.C.'),
  'Lillestrøm': d('Real Sociedad, Viktoria Plzeň, Bournemouth, Torreense', 'Lyon, Sparta Praha, Celta, Levski Sofia'),
  Lyon: d('Leverkusen, Union SG, Crystal Palace, Lillestrøm', 'Real Sociedad, Anderlecht, Jagiellonia, Hoffenheim'),
  Marseille: d('Olympiacos, Anderlecht, Celta, Levski Sofia', 'Leverkusen, Celtic, Sturm Graz, Beşiktaş'),
  Milan: d('Benfica, Ferencváros, Sunderland, Ararat-Armenia', 'Olympiacos, Salzburg, Bournemouth, Levski Sofia'),
  'N.E.C.': d('Benfica, Rennes, Omonia, Levski Sofia', 'Juventus, GNK Dinamo, Celje, Ararat-Armenia'),
  'OFI Crete': d('Leverkusen, Anderlecht, Lech Poznań, Hoffenheim', 'Benfica, Rennes, Sturm Graz, H. Beer-Sheva'),
  Olympiacos: d('Milan, Sparta Praha, Jagiellonia, Hoffenheim', 'Marseille, Rennes, Celje, Torreense'),
  Omonia: d('Benfica, Celtic, Celta, Beşiktaş', 'Juventus, Rennes, Celje, N.E.C.'),
  'Real Sociedad': d('Lyon, Viktoria Plzeň, Bournemouth, Torreense', 'Juventus, Union SG, Crystal Palace, Lillestrøm'),
  Rennes: d('Olympiacos, GNK Dinamo, Omonia, OFI Crete', 'Juventus, Sparta Praha, Sturm Graz, N.E.C.'),
  Salzburg: d('Milan, Sparta Praha, Crystal Palace, Ararat-Armenia', 'Leverkusen, Anderlecht, Celje, Levski Sofia'),
  'Sparta Praha': d('AZ Alkmaar, Rennes, Bournemouth, Lillestrøm', 'Olympiacos, Salzburg, Crystal Palace, Ararat-Armenia'),
  'Sturm Graz': d('Marseille, Rennes, Celje, OFI Crete', 'AZ Alkmaar, GNK Dinamo, Bournemouth, Hoffenheim'),
  Sunderland: d('AZ Alkmaar, GNK Dinamo, Jagiellonia, Levski Sofia', 'Milan, Anderlecht, Lech Poznań, Torreense'),
  Torreense: d('Olympiacos, Celtic, Sunderland, Ararat-Armenia', 'Real Sociedad, Ferencváros, Lech Poznań, Lillestrøm'),
  'Union SG': d('Real Sociedad, Celtic, Lech Poznań, H. Beer-Sheva', 'Lyon, Viktoria Plzeň, Celta, Beşiktaş'),
  'Viktoria Plzeň': d('Benfica, Union SG, Jagiellonia, Levski Sofia', 'Real Sociedad, Ferencváros, Bournemouth, Lillestrøm'),
};

export const UECL_2026: Draw = {
  Aarhus: d('Braga, Twente, Egnatia', 'Gent, Brann, Inter Escaldes'),
  Ajax: d('Atalanta, Getafe, Thun', 'Midtjylland, Sint-Truidense, Hajduk Split'),
  Atalanta: d('Pafos, Kairat Almaty, Mjällby', 'Ajax, Borac, Riga'),
  Borac: d('Atalanta, KuPS Kuopio, Riga', 'Panathinaikos, Hearts, Mjällby'),
  Braga: d('Gent, KuPS Kuopio, Egnatia', 'Copenhagen, Brann, Aarhus'),
  Brann: d('Braga, L. Red Imps, Aarhus', 'Gent, Sint-Truidense, Kauno Žalgiris'),
  Brighton: d('Monaco, U. Craiova, Kauno Žalgiris', 'Panathinaikos, Getafe, Jablonec'),
  Copenhagen: d('Braga, Lugano, Iberia Tbilisi', 'Crvena Zvezda, U. Craiova, Inter Escaldes'),
  'Crvena Zvezda': d('Copenhagen, Trabzonspor, Inter Escaldes', 'Gent, Lugano, Iberia Tbilisi'),
  'CSKA Sofia': d('Monaco, Trabzonspor, Thun', 'Panathinaikos, KuPS Kuopio, Nordsjælland'),
  Egnatia: d('Midtjylland, L. Red Imps, Kauno Žalgiris', 'Braga, U. Craiova, Aarhus'),
  Freiburg: d('Panathinaikos, Twente, Jablonec', 'Monaco, Trabzonspor, Kauno Žalgiris'),
  Gent: d('Crvena Zvezda, Brann, Aarhus', 'Braga, KuPS Kuopio, Thun'),
  Getafe: d('Brighton, Lugano, Inter Escaldes', 'Ajax, U. Craiova, Iberia Tbilisi'),
  'Hajduk Split': d('Ajax, Sint-Truidense, Nordsjælland', 'Midtjylland, L. Red Imps, Thun'),
  Hearts: d('Monaco, Borac, Nordsjælland', 'Pafos, Trabzonspor, Thun'),
  'Iberia Tbilisi': d('Crvena Zvezda, Getafe, Mjällby', 'Copenhagen, Sint-Truidense, Jablonec'),
  'Inter Escaldes': d('Copenhagen, U. Craiova, Aarhus', 'Crvena Zvezda, Getafe, Mjällby'),
  Jablonec: d('Brighton, Lugano, Iberia Tbilisi', 'Freiburg, Trabzonspor, Riga'),
  'Kairat Almaty': d('Panathinaikos, U. Craiova, Mjällby', 'Atalanta, Twente, Riga'),
  'Kauno Žalgiris': d('Freiburg, Brann, Riga', 'Brighton, Lugano, Egnatia'),
  'KuPS Kuopio': d('Gent, Trabzonspor, CSKA Sofia', 'Braga, Borac, Nordsjælland'),
  'L. Red Imps': d('Midtjylland, Twente, Hajduk Split', 'Monaco, Brann, Egnatia'),
  Lugano: d('Crvena Zvezda, Sint-Truidense, Kauno Žalgiris', 'Copenhagen, Getafe, Jablonec'),
  Midtjylland: d('Ajax, Sint-Truidense, Hajduk Split', 'Pafos, L. Red Imps, Egnatia'),
  'Mjällby': d('Pafos, Borac, Inter Escaldes', 'Atalanta, Kairat Almaty, Iberia Tbilisi'),
  Monaco: d('Freiburg, L. Red Imps, Nordsjælland', 'Brighton, Hearts, CSKA Sofia'),
  'Nordsjælland': d('Panathinaikos, KuPS Kuopio, CSKA Sofia', 'Monaco, Hearts, Hajduk Split'),
  Pafos: d('Midtjylland, Hearts, Riga', 'Atalanta, Twente, Mjällby'),
  Panathinaikos: d('Brighton, Borac, CSKA Sofia', 'Freiburg, Kairat Almaty, Nordsjælland'),
  Riga: d('Atalanta, Kairat Almaty, Jablonec', 'Pafos, Borac, Kauno Žalgiris'),
  'Sint-Truidense': d('Ajax, Brann, Iberia Tbilisi', 'Midtjylland, Lugano, Hajduk Split'),
  Thun: d('Gent, Hearts, Hajduk Split', 'Ajax, Twente, CSKA Sofia'),
  Trabzonspor: d('Freiburg, Hearts, Jablonec', 'Crvena Zvezda, KuPS Kuopio, CSKA Sofia'),
  Twente: d('Pafos, Kairat Almaty, Thun', 'Freiburg, L. Red Imps, Aarhus'),
  'U. Craiova': d('Copenhagen, Getafe, Egnatia', 'Brighton, Kairat Almaty, Inter Escaldes'),
};

export interface EuroDef {
  id: string;
  name: string;
  short: string;
  draw: Draw;
  /** League-phase matchdays: each is the list of days its games are spread over. */
  phase: string[][];
  /** Knockout rounds: [name, leg dates]; the final has one date and a venue. */
  ko: [string, string[]][];
  final: [string, string];
  time: [string, string];
  prize: { participation: number; win: number; draw: number; po: number; r16: number; qf: number; sf: number; final: number; winner: number };
}

export const EURO_2026: EuroDef[] = [
  {
    id: 'UCL', name: 'Champions League', short: 'UCL', draw: UCL_2026,
    phase: [['2026-09-08', '2026-09-09', '2026-09-10'], ['2026-10-13', '2026-10-14'], ['2026-10-20', '2026-10-21'], ['2026-11-03', '2026-11-04'], ['2026-11-24', '2026-11-25'], ['2026-12-08', '2026-12-09'], ['2027-01-19', '2027-01-20'], ['2027-01-27']],
    ko: [['Knockout play-offs', ['2027-02-16', '2027-02-23']], ['Round of 16', ['2027-03-09', '2027-03-16']], ['Quarter-finals', ['2027-04-06', '2027-04-13']], ['Semi-finals', ['2027-04-27', '2027-05-04']]],
    final: ['2027-06-05', 'Estadio Metropolitano, Madrid'],
    time: ['18:45', '21:00'],
    prize: { participation: 16e6, win: 1.8e6, draw: 0.6e6, po: 0.9e6, r16: 9.5e6, qf: 10.6e6, sf: 12.8e6, final: 15.8e6, winner: 5.5e6 },
  },
  {
    id: 'UEL', name: 'Europa League', short: 'UEL', draw: UEL_2026,
    phase: [['2026-09-16', '2026-09-17'], ['2026-10-15'], ['2026-10-22'], ['2026-11-05'], ['2026-11-26'], ['2026-12-10'], ['2027-01-21'], ['2027-01-28']],
    ko: [['Knockout play-offs', ['2027-02-18', '2027-02-25']], ['Round of 16', ['2027-03-11', '2027-03-18']], ['Quarter-finals', ['2027-04-08', '2027-04-15']], ['Semi-finals', ['2027-04-29', '2027-05-06']]],
    final: ['2027-05-26', 'Stadion Frankfurt'],
    time: ['18:45', '21:00'],
    prize: { participation: 3.9e6, win: 0.4e6, draw: 0.13e6, po: 0.25e6, r16: 1.5e6, qf: 2.2e6, sf: 3.8e6, final: 5.4e6, winner: 3.4e6 },
  },
  {
    id: 'UECL', name: 'Conference League', short: 'UECL', draw: UECL_2026,
    phase: [['2026-10-15'], ['2026-10-22'], ['2026-11-05'], ['2026-11-26'], ['2026-12-10'], ['2026-12-17']],
    ko: [['Knockout play-offs', ['2027-02-18', '2027-02-25']], ['Round of 16', ['2027-03-11', '2027-03-18']], ['Quarter-finals', ['2027-04-08', '2027-04-15']], ['Semi-finals', ['2027-04-29', '2027-05-06']]],
    final: ['2027-06-02', 'Beşiktaş Stadium, Istanbul'],
    time: ['18:45', '21:00'],
    prize: { participation: 2.6e6, win: 0.34e6, draw: 0.11e6, po: 0.1e6, r16: 0.7e6, qf: 1.1e6, sf: 2.2e6, final: 3.1e6, winner: 1.7e6 },
  },
];

/* ───────────────────────── Domestic cups ───────────────────────── */

/**
 * A domestic cup round. `enter` says who joins at this round: 'top' (all top-flight clubs),
 * 'top-home' / 'top-euro' (top-flight clubs not in / in Europe), a list of names, and `lower`
 * how many lower-division clubs are drawn in. `pairs` fixes real pairings (home first).
 */
export interface DomRoundDef {
  name: string;
  dates: string[];
  time: string;
  et: boolean;
  host: 'lower' | 'drawn' | 'seed' | 'neutral';
  venue?: string;
  enter?: 'top' | 'top+c' | 'efl' | 'top-home' | 'top-euro' | 'super' | 'top-nosuper' | `rank:${number}-${number}` | string[];
  lower?: number;
  pairs?: [string, string][];
  /** Bracket: this round's ties pair the winners of these earlier ties (indexes into the previous round), plus a seeded club at home. */
  bracket?: ([number, number] | [string, number])[];
  prize: number;
}

export interface DomCupDef {
  id: string;
  name: string;
  short: string;
  country: string;
  rounds: DomRoundDef[];
  winner: number;
  runnerUp: number;
}

const ONE = (s: string) => [s];

export const DOMESTIC_2026: DomCupDef[] = [
  {
    id: 'FAC', name: 'FA Cup', short: 'FA Cup', country: 'ENG', winner: 3.6e6, runnerUp: 1.8e6,
    rounds: [
      { name: 'Third round', dates: ONE('2027-01-09'), time: '15:00', et: true, host: 'drawn', enter: 'top+c', lower: 20, prize: 105_000 },
      { name: 'Fourth round', dates: ONE('2027-02-13'), time: '15:00', et: true, host: 'drawn', prize: 160_000 },
      { name: 'Fifth round', dates: ONE('2027-03-06'), time: '15:00', et: true, host: 'drawn', prize: 320_000 },
      { name: 'Quarter-finals', dates: ONE('2027-04-03'), time: '17:30', et: true, host: 'drawn', prize: 640_000 },
      { name: 'Semi-finals', dates: ONE('2027-04-24'), time: '17:15', et: true, host: 'neutral', venue: 'Wembley Stadium', prize: 1.3e6 },
      { name: 'Final', dates: ONE('2027-05-22'), time: '15:00', et: true, host: 'neutral', venue: 'Wembley Stadium', prize: 0 },
    ],
  },
  {
    id: 'EFL', name: 'EFL Cup', short: 'EFL Cup', country: 'ENG', winner: 1.2e6, runnerUp: 0.6e6,
    rounds: [
      { name: 'First round', dates: ONE('2026-08-11'), time: '19:45', et: false, host: 'drawn', enter: 'efl', prize: 0 },
      { name: 'Second round', dates: ONE('2026-08-26'), time: '19:45', et: false, host: 'drawn', enter: 'top-home', prize: 0 },
      { name: 'Third round', dates: ONE('2026-09-15'), time: '19:45', et: false, host: 'drawn', enter: 'top-euro', prize: 100_000 },
      { name: 'Fourth round', dates: ONE('2026-10-28'), time: '19:45', et: false, host: 'drawn', prize: 125_000 },
      { name: 'Quarter-finals', dates: ONE('2026-12-16'), time: '20:00', et: false, host: 'drawn', prize: 150_000 },
      { name: 'Semi-finals', dates: ['2027-01-13', '2027-02-03'], time: '20:00', et: false, host: 'drawn', prize: 200_000 },
      { name: 'Final', dates: ONE('2027-03-21'), time: '16:30', et: true, host: 'neutral', venue: 'Wembley Stadium', prize: 0 },
    ],
  },
  {
    id: 'CDR', name: 'Copa del Rey', short: 'Copa', country: 'ESP', winner: 1.8e6, runnerUp: 0.9e6,
    rounds: [
      { name: 'First round', dates: ONE('2026-10-28'), time: '19:00', et: true, host: 'lower', enter: ['Athletic Bilbao', 'Real Betis', 'Villarreal', 'Sevilla', 'Valencia', 'Celta Vigo', 'Osasuna', 'Getafe', 'Espanyol', 'Rayo Vallecano', 'Alavés', 'Levante', 'Elche', 'Deportivo A Coruña', 'Málaga', 'Racing Santander'], lower: 40, prize: 60_000 },
      { name: 'Round of 32', dates: ONE('2026-12-16'), time: '21:00', et: true, host: 'lower', enter: ['Atlético Madrid', 'Real Sociedad', 'Barcelona', 'Real Madrid'], prize: 90_000 },
      { name: 'Round of 16', dates: ONE('2027-01-06'), time: '21:00', et: true, host: 'lower', prize: 150_000 },
      { name: 'Quarter-finals', dates: ONE('2027-01-13'), time: '21:00', et: true, host: 'drawn', prize: 250_000 },
      { name: 'Semi-finals', dates: ['2027-02-10', '2027-03-03'], time: '21:00', et: true, host: 'drawn', prize: 500_000 },
      { name: 'Final', dates: ONE('2027-04-24'), time: '21:30', et: true, host: 'neutral', venue: 'Estadio de La Cartuja, Seville', prize: 0 },
    ],
  },
  {
    id: 'DFB', name: 'DFB-Pokal', short: 'Pokal', country: 'GER', winner: 3.7e6, runnerUp: 2.1e6,
    rounds: [
      {
        name: 'First round', dates: ['2026-08-22'], time: '15:30', et: true, host: 'lower', enter: 'top', prize: 190_000,
        pairs: [['SC St. Tönis', 'Frankfurt'], ['Preußen Münster', 'Karlsruhe'], ['Waldhof Mannheim', 'Kaiserslautern'], ['Hansa Rostock', 'Stuttgart'], ['Wehen Wiesbaden', 'Leverkusen'],
          ['Energie Cottbus', 'Augsburg'], ['Erzgebirge Aue', 'Hoffenheim'], ['SV Hemelingen', 'Hannover'], ['Saarbrücken', 'Hertha'], ['Viktoria Köln', 'Nürnberg'], ['Duisburg', 'Elversberg'],
          ['Lüneburger SK', 'Werder Bremen'], ['Eintracht Trier', 'RB Leipzig'], ['SG Sonnenhof Großaspach', 'Arminia Bielefeld'], ['1860 München', 'Holstein Kiel'], ['SSV Jeddeloh II', 'Heidenheim'],
          ['Greuther Fürth', 'Bochum'], ['Braunschweig', 'Union Berlin'], ['TSV Schott Mainz', 'Gladbach'], ['VfB Krieschow', 'Mainz 05'], ['Carl Zeiss Jena', 'Darmstadt'], ['Bahlinger SC', 'Magdeburg'],
          ['Westfalia Rhynern', 'Dynamo Dresden'], ['Fortuna Düsseldorf', 'Freiburg'], ['Rot-Weiss Essen', 'St. Pauli'], ['Phönix Lübeck', 'Paderborn'], ['SC Verl', 'Hamburger SV'], ['VSG Altglienicke', 'Wolfsburg'],
          ['Würzburger Kickers', 'Köln'], ['Hallescher FC', 'Schalke'], ['HEBC Hamburg', 'Dortmund'], ['VfL Osnabrück', 'Bayern']],
      },
      { name: 'Second round', dates: ONE('2026-10-28'), time: '20:45', et: true, host: 'lower', prize: 380_000 },
      { name: 'Round of 16', dates: ONE('2026-12-02'), time: '20:45', et: true, host: 'lower', prize: 760_000 },
      { name: 'Quarter-finals', dates: ONE('2027-02-03'), time: '20:45', et: true, host: 'drawn', prize: 1.5e6 },
      { name: 'Semi-finals', dates: ONE('2027-04-21'), time: '20:45', et: true, host: 'drawn', prize: 3e6 },
      { name: 'Final', dates: ONE('2027-05-29'), time: '20:00', et: true, host: 'neutral', venue: 'Olympiastadion, Berlin', prize: 0 },
    ],
  },
  {
    id: 'CIT', name: 'Coppa Italia', short: 'Coppa', country: 'ITA', winner: 4e6, runnerUp: 2e6,
    rounds: [
      { name: 'Preliminary round', dates: ONE('2026-08-09'), time: '21:00', et: false, host: 'seed', pairs: [['Vicenza', 'Catania'], ['Ascoli', 'Potenza'], ['Arezzo', 'Union Brescia'], ['Benevento', 'Ravenna']], prize: 0 },
      {
        name: 'First round', dates: ONE('2026-08-15'), time: '21:00', et: false, host: 'seed', prize: 100_000,
        // Real bracket: [home, away]; a number is the winner of that preliminary tie.
        pairs: [['Parma', '#0'], ['Cremonese', 'Sampdoria'], ['Torino', 'Carrarese'], ['Monza', 'Avellino'], ['Sassuolo', 'Cesena'], ['Frosinone', 'Juve Stabia'], ['Udinese', 'Padova'], ['Venezia', 'Modena'],
          ['Palermo', 'Lecce'], ['Lazio', 'Mantova'], ['Cagliari', '#2'], ['Verona', 'Virtus Entella'], ['Genoa', '#1'], ['Catanzaro', 'Südtirol'], ['Fiorentina', '#3'], ['Pisa', 'Empoli']],
      },
      { name: 'Second round', dates: ONE('2026-09-02'), time: '21:00', et: false, host: 'seed', bracket: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]], prize: 150_000 },
      { name: 'Round of 16', dates: ONE('2026-12-02'), time: '21:00', et: false, host: 'seed', bracket: [['Como', 0], ['Milan', 1], ['Juventus', 2], ['Atalanta', 3], ['Bologna', 4], ['Roma', 5], ['Inter', 6], ['Napoli', 7]], prize: 250_000 },
      { name: 'Quarter-finals', dates: ONE('2027-02-03'), time: '21:00', et: false, host: 'seed', bracket: [[6, 4], [0, 1], [5, 2], [3, 7]], prize: 500_000 },
      { name: 'Semi-finals', dates: ['2027-03-03', '2027-04-21'], time: '21:00', et: false, host: 'drawn', bracket: [[0, 1], [2, 3]], prize: 1e6 },
      { name: 'Final', dates: ONE('2027-05-19'), time: '21:00', et: true, host: 'neutral', venue: 'Stadio Olimpico, Rome', prize: 0 },
    ],
  },
  {
    id: 'CDF', name: 'Coupe de France', short: 'Coupe', country: 'FRA', winner: 1.2e6, runnerUp: 0.5e6,
    rounds: [
      { name: 'Round of 64', dates: ONE('2026-12-20'), time: '18:00', et: false, host: 'lower', enter: 'top', lower: 46, prize: 30_000 },
      { name: 'Round of 32', dates: ONE('2027-01-09'), time: '18:00', et: false, host: 'lower', prize: 60_000 },
      { name: 'Round of 16', dates: ONE('2027-02-03'), time: '21:00', et: false, host: 'lower', prize: 120_000 },
      { name: 'Quarter-finals', dates: ONE('2027-03-03'), time: '21:00', et: false, host: 'drawn', prize: 250_000 },
      { name: 'Semi-finals', dates: ONE('2027-04-21'), time: '21:00', et: false, host: 'drawn', prize: 500_000 },
      { name: 'Final', dates: ONE('2027-05-15'), time: '21:00', et: true, host: 'neutral', venue: 'Stade de France, Saint-Denis', prize: 0 },
    ],
  },
  {
    id: 'TDP', name: 'Taça de Portugal', short: 'Taça', country: 'POR', winner: 1.1e6, runnerUp: 0.5e6,
    rounds: [
      { name: 'Third round', dates: ONE('2026-10-17'), time: '15:00', et: true, host: 'lower', enter: 'top-home', lower: 40, prize: 15_000 },
      { name: 'Fourth round', dates: ONE('2026-11-21'), time: '15:00', et: true, host: 'lower', enter: ['Porto', 'Sporting CP', 'Benfica', 'Braga', 'Torreense'], prize: 25_000 },
      { name: 'Round of 16', dates: ONE('2026-12-16'), time: '20:15', et: true, host: 'lower', prize: 50_000 },
      { name: 'Quarter-finals', dates: ONE('2027-02-03'), time: '20:15', et: true, host: 'drawn', prize: 100_000 },
      { name: 'Semi-finals', dates: ONE('2027-05-22'), time: '18:00', et: true, host: 'neutral', venue: 'Estádio Municipal de Coimbra', prize: 200_000 },
      { name: 'Final', dates: ONE('2027-05-30'), time: '17:15', et: true, host: 'neutral', venue: 'Estádio Nacional, Oeiras', prize: 0 },
    ],
  },
  {
    id: 'TDL', name: 'Taça da Liga', short: 'Taça Liga', country: 'POR', winner: 0.9e6, runnerUp: 0.45e6,
    rounds: [
      { name: 'Quarter-finals', dates: ONE('2026-10-28'), time: '20:45', et: false, host: 'seed', enter: [], pairs: [['Sporting CP', 'Marítimo'], ['Porto', 'Académico de Viseu'], ['Benfica', 'Gil Vicente'], ['Braga', 'Famalicão']], prize: 100_000 },
      { name: 'Semi-finals', dates: ONE('2027-01-05'), time: '20:45', et: false, host: 'neutral', venue: 'Estádio Dr. Magalhães Pessoa, Leiria', prize: 200_000 },
      { name: 'Final', dates: ONE('2027-01-09'), time: '19:45', et: false, host: 'neutral', venue: 'Estádio Dr. Magalhães Pessoa, Leiria', prize: 0 },
    ],
  },
];
