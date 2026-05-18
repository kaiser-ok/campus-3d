const buildings = [
  { id: 'xikun-a', name: '迎曦樓 A棟', x: -1.5, z: 21.2, w: 79.7, d: 14.1, floors: 5, basements: 0, accent: '#617180', rooms: { 1: ['A04', 'A07', 'A08', 'A09', 'A11', 'A12', 'A13'], 2: ['A14', 'A15', 'A16', 'A17', 'A18', 'A22', 'A23'], 3: ['A24', 'A25', 'A26', 'A27', 'A28', 'A29', 'A30', 'A31'], 4: ['A34', 'A35', 'A36', 'A37', 'A39', 'A40', 'A41', 'A42', 'A43', 'A44', 'A53', 'A54', 'A55', 'A57'] } },
  { id: 'xikun-b', name: '德馨樓 B棟', x: -21.8, z: 2.1, w: 39, d: 14, floors: 5, basements: 0, accent: '#687985', rooms: { 1: ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B09', 'B10', 'B11', 'B12'], 2: ['B13', 'B14', 'B15', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21', 'B22', 'B23'], 3: ['B24', 'B25', 'B26', 'B27', 'B28', 'B29', 'B30', 'B31', 'B32', 'B33', 'B34', 'B35'] } },
  { id: 'xikun-c', name: '凌雲樓 C棟 / 資訊中心', x: 4.8, z: -6, w: 12.7, d: 33.8, floors: 5, basements: 0, accent: '#72808b', rooms: { 1: ['C03', 'C04', 'C05機房', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12'], 2: ['C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21'], 3: ['C22', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29', 'C30'], 4: ['C31', 'C33', 'C34', 'C35', 'C36'] } },
  { id: 'xikun-d', name: '凱風樓 D棟', x: -21.9, z: -16.2, w: 38.9, d: 13.5, floors: 5, basements: 0, accent: '#697987', rooms: { 1: ['D01', 'D06', 'D07', 'D08', 'D09', 'D11'], 2: ['D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D18'], 3: ['D19', 'D20', 'D21', 'D25', 'D26', 'D27', 'D28', 'D29', 'D30', 'D31'], 4: ['D22', 'D23', 'D24'] } },
  { id: 'xikun-e', name: '向陽樓 E棟', x: 32.6, z: -6.1, w: 12.4, d: 32, floors: 5, basements: 0, accent: '#64798a', rooms: { 1: ['E01', 'E13'], 2: ['E16', 'E17', 'E18', 'E19', 'E20'], 3: ['E21', 'E22', 'E23', 'E24', 'E25'] } },
  { id: 'xikun-library', name: '圖書館', x: 18.8, z: -9.9, w: 9.9, d: 6.7, floors: 2, basements: 0, accent: '#8a7b67', rooms: { 1: ['圖書館'], 2: ['閱讀區'] } },
  { id: 'xikun-activity', name: '活動中心', x: 18.8, z: -18.7, w: 10.9, d: 8.2, floors: 2, basements: 0, accent: '#737c88', rooms: { 1: ['活動中心'], 2: ['體育館'] } },
  { id: 'xikun-guard', name: '警衛室 / 校門', x: 11.1, z: 33.3, w: 5.7, d: 4.7, floors: 1, basements: 0, accent: '#667983', rooms: { 1: ['警衛室'] } },
  { id: 'xikun-stand', name: '司令臺', x: -10.4, z: -25.5, w: 6.6, d: 2.6, floors: 1, basements: 0, accent: '#8a7b67', rooms: { 1: ['司令臺'] } },
];

const buildingMap = new Map(buildings.map((building) => [building.id, building]));

const l2AccessRows = `
CKJHS-L2-01|10.226.133.1|64:29:43:D4:B0:98|DGS-1250-52XMP|迎曦樓-A28前走廊
CKJHS-L2-02|10.226.133.2|64:29:43:D4:B0:60|DGS-1250-52XMP|迎曦樓-A24前走廊
CKJHS-L2-03|10.226.133.3|64:29:43:D4:96:58|DGS-1250-52XMP|德馨樓-B18後走廊
CKJHS-L2-04|10.226.133.4|64:29:43:D4:A3:78|DGS-1250-52XMP|凌雲樓-C14後走廊
CKJHS-L2-05|10.226.133.5|64:29:43:D4:A6:18|DGS-1250-52XMP|凱風樓-D17前走廊
CKJHS-L2-06|10.226.133.6|64:29:43:D4:AD:88|DGS-1250-52XMP|向陽樓-E13公托走廊
CKJHS-L2-07|10.226.133.7|64:29:43:D4:AE:A0|DGS-1250-52XMP|資訊中心-C05
CKJHS-L2-08|10.226.133.8|64:29:43:D4:AF:B8|DGS-1250-52XMP|圖書館
CKJHS-L2-09|10.226.133.9|04:BA:D6:D3:B9:C0|DGS-1250-28X|資訊中心-C05
CKJHS-L2-10|10.226.133.10|64:29:43:D4:97:70|DGS-1250-52XMP|迎曦樓-A24前走廊
CKJHS-L2-11|10.226.133.11|64:29:43:D4:A5:70|DGS-1250-52XMP|凱風樓-D17前走廊
CKJHS-L2-12|10.226.133.12|04:BA:D6:D3:C0:C0|DGS-1250-28X|資訊中心-C05
CKJHS-L2-13|10.226.133.13|04:BA:D6:D3:BA:40|DGS-1250-28X|德馨樓-B18後走廊
CKJHS-L2-14|10.226.133.14|5C:D9:98:A4:87:79|DGS-1210-10P|活動中心
CKJHS-L2-15|10.226.133.15|04:BA:D6:D3:BB:40|DGS-1250-28X|迎曦樓-A19生教組
CKJHS-L2-16|10.226.133.16|04:BA:D6:D3:BD:40|DGS-1250-28X|迎曦樓-A18教媒中心
CKJHS-L2-17|10.226.133.17|64:29:43:D3:A4:68|DGS-1250-52XMP|迎曦樓-A04總務處
CKJHS-L2-18|10.226.133.18|64:29:43:D3:A7:40|DGS-1250-52XMP|迎曦樓-A07學務處
CKJHS-L2-20|10.226.133.20|04:BA:D6:D3:BA:C0|DGS-1250-28X|迎曦樓-A13多功能教室
CKJHS-L2-21|10.226.133.21|A4:2A:95:72:9A:E0|DGS-1250-28X|迎曦樓-A15會計室
CKJHS-L2-22|10.226.133.22|64:29:43:D3:93:90|DGS-1250-52XMP|迎曦樓-A16教務處
CKJHS-L2-23|10.226.133.23|B8:EC:A3:FB:17:5C|Zyxel GS1200-8|資訊中心-C05辦公室
CKJHS-L2-24|10.226.133.24|04:BA:D6:D3:BF:80|DGS-1250-28X|迎曦樓-A25導辦
CKJHS-L2-25|10.226.133.25|A4:2A:95:72:9A:C0|DGS-1250-28X|迎曦樓-A26導師辦公室
CKJHS-L2-26|10.226.133.26|A4:2A:95:72:9A:60|DGS-1250-28X|迎曦樓-A39導師辦公室
CKJHS-L2-27|10.226.133.27|BC:CF:4F:74:89:CD|Zyxel XGS-1930-52HP|凱風樓-電腦教室(一)
CKJHS-L2-28|10.226.133.28|0C:0E:76:29:FD:D8|DGS-1250-52X|凱風樓-電腦教室(二)
CKJHS-L2-29|10.226.133.29|0C:0E:76:29:DF:70|DGS-1250-52X|凱風樓-電腦教室(三)
CKJHS-L2-30|10.226.133.30|0C:0E:76:29:FC:88|DGS-1250-52X|凱風樓-電腦教室(四)
CKJHS-L2-31|10.226.133.31|04:BA:D6:D3:BE:20|DGS-1250-28X|凱風樓-D06專任辦公室
CKJHS-L2-32|10.226.133.32|A4:2A:95:64:D2:E0|DGS-1250-28X|德馨樓-B03特教辦公室
CKJHS-L2-33|10.226.133.33|10:62:EB:40:B2:A7|DGS-1210-28|凱風樓-D01體育專任
CKJHS-L2-34|10.226.133.34|04:BA:D6:D3:BD:60|DGS-1250-28X|凌雲樓-C03後走廊
CKJHS-L2-35|10.226.133.35|04:BA:D6:D3:CB:C0|DGS-1250-28X|向陽樓-E01幼兒園辦公室
CKJHS-L2-36|10.226.133.36|B8:EC:A3:FB:17:6D|Zyxel GS1200-8|凌雲樓-C09教師會
CKJHS-L2-37|10.226.133.37|B8:EC:A3:F9:9C:09|Zyxel GS1200-5HP|司令臺
CKJHS-L2-38|10.226.133.38|B8:EC:A3:FB:1A:42|Zyxel GS1200-8|多功能會議室
CKJHS-L2-39|10.226.133.39|9C:D6:43:53:99:F5|DGS-1210-28|資訊中心-C05辦公室
CKJHS-L2-40|10.226.133.40|C8:78:7D:F9:C4:10|DGS-1250-52XMP|凌雲樓-C14族語教室
CKJHS-L2-41|10.226.133.41|C8:78:7D:F9:C3:D8|DGS-1250-52XMP|凱風樓-D17自然教室
CKJHS-L2-45|10.226.133.45|64:29:43:D2:08:F0|DGS-1250-52X|凱風樓-電腦教室D22
CKJHS-L2-46|10.226.133.46|64:29:43:D2:0F:80|DGS-1250-52X|凱風樓-電腦教室D23
CKJHS-L2-47|10.226.133.47|64:29:43:D2:0C:38|DGS-1250-52X|凱風樓-電腦教室D24
CKJHS-L2-48|10.226.133.48|B8:EC:A3:FB:1A:30|Zyxel GS1200-8|警衛室
`;

const edgeRows = `
向陽樓E16|10.226.133.140|64:29:43:34:38:A0|WS6-DGS-1210-10P/F1|向陽樓-E16
向陽樓E17|10.226.133.139|64:29:43:34:38:C0|WS6-DGS-1210-10P/F1|向陽樓-E17
向陽樓E18|10.226.133.138|64:29:43:34:38:40|WS6-DGS-1210-10P/F1|向陽樓-E18
向陽樓E19|10.226.133.137|64:29:43:34:38:20|WS6-DGS-1210-10P/F1|向陽樓-E19
向陽樓E20|10.226.133.136|64:29:43:34:38:60|WS6-DGS-1210-10P/F1|向陽樓-E20
向陽樓E21|10.226.133.135|64:29:43:34:39:80|WS6-DGS-1210-10P/F1|向陽樓-E21
向陽樓E22|10.226.133.134|64:29:43:34:3C:00|WS6-DGS-1210-10P/F1|向陽樓-E22
向陽樓E23|10.226.133.133|64:29:43:34:3B:E0|WS6-DGS-1210-10P/F1|向陽樓-E23
向陽樓E24|10.226.133.132|64:29:43:34:39:40|WS6-DGS-1210-10P/F1|向陽樓-E24
向陽樓E25|10.226.133.131|64:29:43:34:3A:00|WS6-DGS-1210-10P/F1|向陽樓-E25
迎曦樓A13|10.226.133.151|64:29:43:34:B4:C0|WS6-DGS-1210-10P/F1|迎曦樓-A13
迎曦樓A29|10.226.133.148|64:29:43:34:3C:20|WS6-DGS-1210-10P/F1|迎曦樓-A29
迎曦樓A30|10.226.133.149|64:29:43:34:3A:E0|WS6-DGS-1210-10P/F1|迎曦樓-A30
迎曦樓A31|10.226.133.150|64:29:43:34:3B:00|WS6-DGS-1210-10P/F1|迎曦樓-A31
迎曦樓A34|10.226.133.141|00:CD:88:60:1D:24|WS6-DGS-1210-10P/F1|迎曦樓-A34
迎曦樓A35|10.226.133.142|64:29:43:34:38:E0|WS6-DGS-1210-10P/F1|迎曦樓-A35
迎曦樓A36|10.226.133.143|64:29:43:34:39:00|WS6-DGS-1210-10P/F1|迎曦樓-A36
迎曦樓A37|10.226.133.144|64:29:43:34:39:20|WS6-DGS-1210-10P/F1|迎曦樓-A37
迎曦樓A40|10.226.133.145|64:29:43:34:3B:80|WS6-DGS-1210-10P/F1|迎曦樓-A40
迎曦樓A41|10.226.133.146|64:29:43:34:3B:A0|WS6-DGS-1210-10P/F1|迎曦樓-A41
迎曦樓A42|10.226.133.147|64:29:43:34:3B:C0|WS6-DGS-1210-10P/F1|迎曦樓-A42
迎曦樓A14|10.228.133.107|C8:78:7D:1E:F2:E0|DGS-1210-10P|迎曦樓-A14
迎曦樓A22|10.228.133.103|3C:33:32:A2:8C:30|DGS-1210-10P|迎曦樓-A22
迎曦樓A23|10.228.133.104|3C:33:32:A2:9E:90|DGS-1210-10P|迎曦樓-A23
迎曦樓A43|10.228.133.105|C8:78:7D:1E:F4:A0|DGS-1210-10P|迎曦樓-A43
德馨樓B04左|10.228.133.129|40:86:CB:96:45:40|DGS-1210-10P|德馨樓-B04
德馨樓B06|10.228.133.82|3C:33:32:A2:92:70|DGS-1210-10P|德馨樓-B06
德馨樓B07|10.228.133.108|C8:78:7D:1E:F2:C0|DGS-1210-10P|德馨樓-B07
德馨樓B09|10.228.133.130|40:86:CB:96:45:80|DGS-1210-10P|德馨樓-B09
德馨樓B10|10.228.133.131|40:86:CB:96:45:E0|DGS-1210-10P|德馨樓-B10
德馨樓B11|10.228.133.132|40:86:CB:96:45:60|DGS-1210-10P|德馨樓-B11
德馨樓B12|10.228.133.109|C8:78:7D:1E:F3:00|DGS-1210-10P|德馨樓-B12
德馨樓B13|10.228.133.83|3C:33:32:A2:97:90|DGS-1210-10P|德馨樓-B13
德馨樓B14|10.228.133.84|3C:33:32:A2:98:50|DGS-1210-10P|德馨樓-B14
德馨樓B15|10.228.133.85|3C:33:32:A2:99:D0|DGS-1210-10P|德馨樓-B15
德馨樓B16|10.228.133.86|3C:33:32:A2:98:10|DGS-1210-10P|德馨樓-B16
德馨樓B17|10.228.133.87|3C:33:32:A2:9B:70|DGS-1210-10P|德馨樓-B17
德馨樓B18|10.228.133.88|3C:33:32:A2:9B:90|DGS-1210-10P|德馨樓-B18
德馨樓B19|10.228.133.89|3C:33:32:A2:9B:D0|DGS-1210-10P|德馨樓-B19
德馨樓B20|10.228.133.90|3C:33:32:A2:8E:30|DGS-1210-10P|德馨樓-B20
德馨樓B21|10.228.133.91|3C:33:32:A2:8E:70|DGS-1210-10P|德馨樓-B21
德馨樓B22|10.228.133.92|3C:33:32:A2:88:70|DGS-1210-10P|德馨樓-B22
德馨樓B23|10.228.133.93|3C:33:32:A2:89:B0|DGS-1210-10P|德馨樓-B23
德馨樓B24|10.228.133.94|3C:33:32:A2:88:B0|DGS-1210-10P|德馨樓-B24
德馨樓B25|10.228.133.95|3C:33:32:A2:97:D0|DGS-1210-10P|德馨樓-B25
德馨樓B26|10.228.133.96|3C:33:32:A2:97:B0|DGS-1210-10P|德馨樓-B26
德馨樓B27|10.228.133.97|3C:33:32:A2:99:90|DGS-1210-10P|德馨樓-B27
德馨樓B28|10.228.133.98|3C:33:32:A2:89:90|DGS-1210-10P|德馨樓-B28
德馨樓B29|10.228.133.99|3C:33:32:A2:8C:B0|DGS-1210-10P|德馨樓-B29
德馨樓B30|10.228.133.100|3C:33:32:A2:8C:F0|DGS-1210-10P|德馨樓-B30
德馨樓B31|10.228.133.101|3C:33:32:A2:8A:B0|DGS-1210-10P|德馨樓-B31
德馨樓B32|10.228.133.102|3C:33:32:A2:8C:10|DGS-1210-10P|德馨樓-B32
德馨樓B33|10.228.133.133|88:76:B9:CD:A5:A0|DGS-1210-10P|德馨樓-B33
德馨樓B34|10.228.133.134|88:76:B9:CD:A6:00|DGS-1210-10P|德馨樓-B34
德馨樓B35|10.228.133.135|88:76:B9:CD:A6:60|DGS-1210-10P|德馨樓-B35
凌雲樓C11|10.228.133.110|C8:78:7D:1E:E5:40|DGS-1210-10P|凌雲樓-C11
凌雲樓C12|10.228.133.106|C8:78:7D:1E:F5:C0|DGS-1210-10P|凌雲樓-C12
凌雲樓C15|10.228.133.111|C8:78:7D:1E:E6:40|DGS-1210-10P|凌雲樓-C15
凌雲樓C16|10.228.133.112|C8:78:7D:1E:E6:00|DGS-1210-10P|凌雲樓-C16
凌雲樓C17|10.228.133.113|C8:78:7D:1E:E6:20|DGS-1210-10P|凌雲樓-C17
凌雲樓C18|10.228.133.114|C8:78:7D:1E:E7:60|DGS-1210-10P|凌雲樓-C18
凌雲樓C19|10.228.133.115|C8:78:7D:1E:DE:00|DGS-1210-10P|凌雲樓-C19
凌雲樓C20|10.228.133.116|C8:78:7D:1E:DE:80|DGS-1210-10P|凌雲樓-C20
凌雲樓C21|10.228.133.117|C8:78:7D:1E:DD:00|DGS-1210-10P|凌雲樓-C21
凌雲樓C24|10.228.133.118|C8:78:7D:1E:DC:C0|DGS-1210-10P|凌雲樓-C24
凌雲樓C25|10.228.133.119|C8:78:7D:1E:DE:20|DGS-1210-10P|凌雲樓-C25
凌雲樓C26|10.228.133.120|C8:78:7D:1F:03:40|DGS-1210-10P|凌雲樓-C26
凌雲樓C27|10.228.133.121|C8:78:7D:1F:04:80|DGS-1210-10P|凌雲樓-C27
凌雲樓C28|10.228.133.122|C8:78:7D:1F:04:A0|DGS-1210-10P|凌雲樓-C28
凌雲樓C29|10.228.133.123|C8:78:7D:1F:04:60|DGS-1210-10P|凌雲樓-C29
凌雲樓C30|10.228.133.124|C8:78:7D:1F:05:80|DGS-1210-10P|凌雲樓-C30
凌雲樓C33|10.228.133.125|C8:78:7D:1E:F6:A0|DGS-1210-10P|凌雲樓-C33
凌雲樓C34|10.228.133.126|C8:78:7D:3A:2E:90|DGS-1210-10P|凌雲樓-C34
凌雲樓C35|10.228.133.127|C8:78:7D:1E:F7:80|DGS-1210-10P|凌雲樓-C35
凌雲樓C36|10.228.133.128|C8:78:7D:1E:F7:A0|DGS-1210-10P|凌雲樓-C36
Cisco SW.241|10.228.133.241|00:87:64:1E:C1:41|Cisco C2960L|迎曦樓-A28前走廊
Cisco SW.242|10.228.133.242|00:87:64:1E:F1:C1|Cisco C2960L|德馨樓-B18後走廊
Cisco SW.243|10.228.133.243|00:87:64:76:78:C1|Cisco C2960L|德馨樓-B18後走廊
Cisco SW.244|10.228.133.244|00:87:64:76:87:C1|Cisco C2960L|凌雲樓-C14後走廊
Zyxel SW.245|10.228.133.245|70:49:A2:3D:3E:C8|Zyxel XGS1935-52HP|凌雲樓-C14後走廊
Cisco SW.246|10.228.133.246|00:87:64:1F:81:C1|Cisco C2960L|凱風樓-D17前走廊
Cisco SW.247|10.228.133.247|00:87:64:1F:F6:C1|Cisco C2960L|向陽樓-E13公托走廊
`;

const serverRows = `
DHCP-Lan|163.20.25.3|00:15:5D:85:5C:0C|DHCP Server|凌雲樓-C05機房
DHCP-Intra-2|10.241.133.1|00:15:5D:64:95:1E|DHCP Server|凌雲樓-C05機房
DHCP-Intra-3|10.192.48.2|00:15:5D:85:5C:0E|DHCP Server|凌雲樓-C05機房
DHCP-MacAuth|10.192.24.1|00:15:5D:85:5C:0D|DHCP Server|凌雲樓-C05機房
DHCP-VoIP|10.243.133.1|00:15:5D:85:5C:0F|DHCP Server|凌雲樓-C05機房
`;

const dlinkApLocations = [
  ['D-Link AP.01', '10.129.133.1', '迎曦樓 A54'], ['D-Link AP.02', '10.129.133.2', '迎曦樓 A27'], ['D-Link AP.03', '10.129.133.3', '迎曦樓 A53'], ['D-Link AP.04', '10.129.133.4', '迎曦樓 A39'], ['D-Link AP.05', '10.129.133.5', '迎曦樓 A55'], ['D-Link AP.06', '10.129.133.6', '迎曦樓 A12'], ['D-Link AP.07', '10.129.133.7', '迎曦樓 A11'], ['D-Link AP.08', '10.129.133.8', '迎曦樓 A13'], ['D-Link AP.09', '10.129.133.9', '德馨樓 B04'], ['D-Link AP.10', '10.129.133.10', '德馨樓 B05'], ['D-Link AP.11', '10.129.133.11', '凱風樓 D07'], ['D-Link AP.12', '10.129.133.12', '凱風樓 D13'], ['D-Link AP.13', '10.129.133.13', '凱風樓 D12'], ['D-Link AP.14', '10.129.133.14', '凱風樓 D08'], ['D-Link AP.15', '10.129.133.15', '凱風樓 D11'], ['D-Link AP.16', '10.129.133.16', '凱風樓 D14'], ['D-Link AP.17', '10.129.133.17', '凌雲樓 C10'], ['D-Link AP.18', '10.129.133.18', '凌雲樓 C11'], ['D-Link AP.19', '10.129.133.19', '凌雲樓 C13'], ['D-Link AP.20', '10.129.133.20', '德馨樓 B09'], ['D-Link AP.21', '10.129.133.21', '德馨樓 B10'], ['D-Link AP.22', '10.129.133.22', '凱風樓 D16'], ['D-Link AP.23', '10.129.133.23', '凱風樓 D31'], ['D-Link AP.24', '10.129.133.24', '凱風樓 D30'], ['D-Link AP.25', '10.129.133.25', '凱風樓 D28'], ['D-Link AP.26', '10.129.133.26', '凱風樓 D29'], ['D-Link AP.27', '10.129.133.27', '凌雲樓 C07'], ['D-Link AP.28', '10.129.133.28', '迎曦樓 A25'], ['D-Link AP.29', '10.129.133.29', '迎曦樓 A24'], ['D-Link AP.30', '10.129.133.30', '迎曦樓 A23'], ['D-Link AP.31', '10.129.133.31', '迎曦樓 A22'], ['D-Link AP.32', '10.129.133.32', '迎曦樓 A21'], ['D-Link AP.33', '10.129.133.33', '凱風樓 D27'], ['D-Link AP.34', '10.129.133.34', '凱風樓 D26'], ['D-Link AP.35', '10.129.133.35', '凱風樓 D25'], ['D-Link AP.36', '10.129.133.36', '凱風樓 D24'], ['D-Link AP.37', '10.129.133.37', '凱風樓 D21'], ['D-Link AP.38', '10.129.133.38', '凱風樓 D20'], ['D-Link AP.39', '10.129.133.39', '凱風樓 D19'], ['D-Link AP.40', '10.129.133.40', '凱風樓 D18'], ['D-Link AP.41', '10.129.133.41', '凱風樓 D17'], ['D-Link AP.42', '10.129.133.42', '凱風樓 D15'],
  ['DAP-X2850_2F-F02-1', '10.129.133.43', '2F F02-1'], ['DAP-X2850_2F-F02-2', '10.129.133.44', '2F F02-2'], ['DAP-X2850_1F-A09', '10.129.133.45', '1F 迎曦樓 A09'], ['DAP-X2850_1F-A08', '10.129.133.46', '1F 迎曦樓 A08'], ['DAP-X2850_1F-A07', '10.129.133.47', '1F 迎曦樓 A07'], ['DAP-X2850_2F-C04', '10.129.133.48', '2F 凌雲樓 C04'], ['DAP-X2850_2F-C03', '10.129.133.49', '2F 凌雲樓 C03'], ['DAP-X2850_2F-C08', '10.129.133.50', '2F 凌雲樓 C08'], ['DAP-X2850_2F-C09', '10.129.133.51', '2F 凌雲樓 C09'], ['DAP-X2850_3F-C14', '10.129.133.52', '3F 凌雲樓 C14'], ['DAP-X2850_2F-D09', '10.129.133.53', '2F 凱風樓 D09'], ['DAP-X2850_4F-D22', '10.129.133.54', '4F 凱風樓 D22'], ['DAP-X2850_4F-D23', '10.129.133.55', '4F 凱風樓 D23'], ['DAP-X2850_1F-D01', '10.129.133.56', '1F 凱風樓 D01'], ['DAP-X2850_1F-F01', '10.129.133.57', '1F F01'], ['DAP-X2850_1F-B01', '10.129.133.58', '1F 德馨樓 B01'], ['DAP-X2850_1F-B02', '10.129.133.59', '1F 德馨樓 B02'], ['DAP-X2850_1F-B03', '10.129.133.60', '1F 德馨樓 B03'], ['DAP-X2850_1F-A57', '10.129.133.61', '1F 迎曦樓 A57'], ['DAP-X2850_1F-A04', '10.129.133.62', '1F 迎曦樓 A04'], ['DAP-X2850_1F-A05', '10.129.133.63', '1F 迎曦樓 A05'], ['DAP-X2850_2F-A14', '10.129.133.64', '2F 迎曦樓 A14'], ['DAP-X2850_2F-A15', '10.129.133.65', '2F 迎曦樓 A15'], ['DAP-X2850_2F-C05', '10.129.133.66', '2F 凌雲樓 C05'], ['DAP-X2850_1F-A06', '10.129.133.67', '1F 迎曦樓 A06'], ['DAP-X2850_1F-C1F_川堂', '10.129.133.68', '1F 凌雲樓 川堂'], ['DAP-X2850_2F-A16', '10.129.133.69', '2F 迎曦樓 A16'], ['DAP-X2850_2F-A17', '10.129.133.70', '2F 迎曦樓 A17'], ['DAP-X2850_2F-A18', '10.129.133.71', '2F 迎曦樓 A18'],
];

const ciscoGroups = [
  { start: 11, locations: ['A29', 'A30', 'A31', 'A32', 'A34', 'A35', 'A36', 'A37', 'A40', 'A41', 'A42', 'A43', 'A44'], prefix: '迎曦樓' },
  { start: 24, locations: ['B06', 'B07', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21', 'B22', 'B23', 'B24', 'B25', 'B26', 'B27', 'B28', 'B29', 'B30', 'B31', 'B32', 'B33'], prefix: '德馨樓' },
  { start: 49, locations: ['活動中心', '圖書館', 'C12', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29', 'C30', 'C31', 'C33', 'C34', 'C35', 'C36'], prefix: '凌雲樓' },
  { start: 72, locations: ['E16', 'E17', 'E18', 'E19', 'E20', 'E21', 'E22', 'E23', 'E24', 'E25'], prefix: '向陽樓' },
];

function parseRows(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const [name, ip, mac, model, location] = line.split('|');
    return { name, ip, mac, model, location };
  });
}

function roomCode(text = '') {
  const match = String(text).match(/([A-F])\s*-?\s*(\d{1,2})/i) || String(text).match(/([A-F])(\d{2})/i);
  return match ? { letter: match[1].toUpperCase(), number: Number(match[2]) } : null;
}

function buildingIdFor(location = '', name = '') {
  const text = `${location} ${name}`;
  const code = roomCode(text);
  if (/圖書館/.test(text)) return 'xikun-library';
  if (/活動中心/.test(text)) return 'xikun-activity';
  if (/警衛/.test(text)) return 'xikun-guard';
  if (/司令臺/.test(text)) return 'xikun-stand';
  if (/迎曦|A\d/i.test(text) || code?.letter === 'A') return 'xikun-a';
  if (/德馨|B\d/i.test(text) || code?.letter === 'B') return 'xikun-b';
  if (/凌雲|資訊中心|C\d/i.test(text) || code?.letter === 'C') return 'xikun-c';
  if (/凱風|D\d/i.test(text) || code?.letter === 'D') return 'xikun-d';
  if (/向陽|E\d/i.test(text) || code?.letter === 'E') return 'xikun-e';
  return 'xikun-c';
}

function normalizeRoomLabel(room = '') {
  return String(room).replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function roomKey(code) {
  return code ? `${code.letter}${String(code.number).padStart(2, '0')}` : '';
}

function findRoomOnBuilding(building, code) {
  const key = roomKey(code);
  if (!building || !key) return null;

  for (const [floor, rooms] of Object.entries(building.rooms || {})) {
    const roomIndex = rooms.findIndex((room) => normalizeRoomLabel(room).includes(key));
    if (roomIndex >= 0) {
      return { floor: Number(floor), roomIndex, roomCount: rooms.length };
    }
  }
  return null;
}

function floorFor(location = '', name = '') {
  const text = `${name} ${location}`;
  const explicit = text.match(/([1-5])F/i);
  if (explicit) return `${explicit[1]}F`;

  const code = roomCode(text);
  const building = buildingMap.get(buildingIdFor(location, name));
  const room = findRoomOnBuilding(building, code);
  if (room?.floor) return `${room.floor}F`;

  if (!code) return '1F';
  const n = code.number;
  if (code.letter === 'A') return n <= 18 ? '1F' : n <= 31 ? '2F' : n <= 44 ? '3F' : '4F';
  if (code.letter === 'B') return n <= 12 ? '1F' : n <= 23 ? '2F' : '3F';
  if (code.letter === 'C') return n <= 12 ? '1F' : n <= 24 ? '2F' : n <= 30 ? '3F' : '4F';
  if (code.letter === 'D') return n <= 11 ? '1F' : n <= 21 ? '2F' : n <= 31 ? '3F' : '4F';
  if (code.letter === 'E') return n <= 15 ? '1F' : n <= 20 ? '2F' : '3F';
  return '1F';
}

function roomLabelFor(location = '', name = '') {
  const text = `${location} ${name}`;
  const code = roomCode(text);
  const namedPattern = /(前走廊|後走廊|走廊|機房|辦公室|導師辦公室|導辦|教媒中心|總務處|學務處|教務處|會計室|多功能教室|自然教室|族語教室|電腦教室|實驗室|閱讀區|圖書館|活動中心|體育館|川堂|公托|幼兒園|警衛室|司令臺|球場)/;
  const named = text.match(namedPattern)?.[1] || '';
  if (code) {
    const base = roomKey(code);
    return named ? `${base} ${named}` : base;
  }
  if (/圖書館/.test(text)) return '圖書館';
  if (/活動中心/.test(text)) return '活動中心';
  if (/警衛/.test(text)) return '警衛室';
  if (/司令臺/.test(text)) return '司令臺';
  return named;
}

function roomBaseKey(label = '') {
  const code = roomCode(label);
  return code ? roomKey(code) : normalizeRoomLabel(label);
}

function enrichBuildingRoomsWithDevices(buildingList, deviceList) {
  const namesByBuilding = new Map();
  deviceList.forEach((device) => {
    const key = roomBaseKey(device.room);
    if (!device.building || !key) return;
    const current = namesByBuilding.get(device.building) || new Map();
    const existing = current.get(key);
    if (!existing || String(device.room).length > String(existing).length) current.set(key, device.room);
    namesByBuilding.set(device.building, current);
  });
  return buildingList.map((building) => {
    const names = namesByBuilding.get(building.id);
    if (!names) return building;
    const rooms = Object.fromEntries(Object.entries(building.rooms || {}).map(([floor, list]) => [
      floor,
      list.map((room) => {
        const enriched = names.get(roomBaseKey(room));
        return enriched && enriched.length > String(room).length ? enriched : room;
      }),
    ]));
    return { ...building, rooms };
  });
}

function clampInside(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positionFor(location = '', name = '', index = 0, kind = 'switch') {
  const buildingId = buildingIdFor(location, name);
  const building = buildingMap.get(buildingId) || buildings[0];
  const code = roomCode(`${location} ${name}`);
  const floor = Math.max(1, Number(floorFor(location, name).match(/(\d+)/)?.[1]) || 1);
  const rooms = building.rooms?.[floor] || [];
  const matchedRoom = findRoomOnBuilding(building, code);
  const fallbackRoomCount = Math.max(1, rooms.length || 8);
  const fallbackIndex = code ? Math.round(((code.number % 50) / 50) * (fallbackRoomCount - 1)) : index % fallbackRoomCount;
  const roomIndex = matchedRoom?.floor === floor ? matchedRoom.roomIndex : fallbackIndex;
  const roomCount = matchedRoom?.floor === floor ? matchedRoom.roomCount : fallbackRoomCount;
  const along = (roomIndex + 0.5) / Math.max(1, roomCount);
  const floorLane = (floor - 0.5) / Math.max(1, building.floors || floor);
  const jitter = (((index * 13) % 7) - 3) * 0.06;
  const deviceBias = kind === 'ap' ? 0.32 : kind === 'server' ? -0.24 : -0.32;
  const margin = 0.8;

  if (building.w >= building.d) {
    const x = building.x - building.w / 2 + building.w * along;
    const zBase = building.z - building.d / 2 + building.d * (0.18 + floorLane * 0.64);
    return {
      buildingId,
      x: Number(clampInside(x + jitter, building.x - building.w / 2 + margin, building.x + building.w / 2 - margin).toFixed(1)),
      z: Number(clampInside(zBase + deviceBias, building.z - building.d / 2 + margin, building.z + building.d / 2 - margin).toFixed(1)),
    };
  }

  const xBase = building.x - building.w / 2 + building.w * (0.18 + floorLane * 0.64);
  const z = building.z - building.d / 2 + building.d * along;
  return {
    buildingId,
    x: Number(clampInside(xBase + deviceBias, building.x - building.w / 2 + margin, building.x + building.w / 2 - margin).toFixed(1)),
    z: Number(clampInside(z + jitter, building.z - building.d / 2 + margin, building.z + building.d / 2 - margin).toFixed(1)),
  };
}
function brandFrom(model = '', name = '') {
  const text = `${model} ${name}`;
  if (/juniper/i.test(text)) return 'Juniper';
  if (/cisco/i.test(text)) return 'Cisco';
  if (/zyxel|xgs|gs1200/i.test(text)) return 'Zyxel';
  if (/d-link|dgs|dxs|dap|ws6/i.test(text)) return 'D-Link';
  return '未標示';
}

function statusFor(name = '') {
  if (/D22|D23|D24|C14|B18|A28|L2-253/.test(name)) return 'warning';
  return 'online';
}

function makeSwitch(row, index, role = 'L2 接取交換器') {
  const pos = positionFor(row.location, row.name, index, 'switch');
  const ports = Number(row.model?.match(/(\d+)(?:X|P|HP)?$/)?.[1]) || (/52/.test(row.model) ? 52 : 10);
  return {
    id: row.name,
    type: 'switch',
    name: row.name,
    building: pos.buildingId,
    x: pos.x,
    z: pos.z,
    floor: floorFor(row.location, row.name),
    status: statusFor(row.name),
    users: Math.max(8, Math.min(180, Math.round(ports * 2.3 + (index % 9) * 6))),
    mbps: Math.max(80, Math.min(2200, Math.round(ports * 18 + (index % 7) * 75))),
    channel: row.ip,
    ip: row.ip,
    mac: row.mac,
    model: row.model,
    vendor: brandFrom(row.model, row.name),
    role,
    room: roomLabelFor(row.location, row.name),
    placement: 'corridor-edge',
    location: row.location,
  };
}

function makeServer(row, index) {
  const pos = positionFor(row.location, row.name, index, 'switch');
  return {
    id: row.name,
    type: 'server',
    name: row.name,
    building: pos.buildingId,
    x: pos.x,
    z: pos.z,
    floor: '1F',
    status: 'online',
    users: 0,
    mbps: 0,
    channel: row.ip,
    ip: row.ip,
    mac: row.mac,
    model: row.model,
    vendor: '微軟/未標示',
    role: row.name === 'DHCP-Lan' ? '對外/學術網路 DHCP' : row.name === 'DHCP-VoIP' ? 'VoIP 語音 DHCP' : row.name === 'DHCP-MacAuth' ? 'MAC 認證 DHCP' : '內網 DHCP',
    room: roomLabelFor(row.location, row.name),
    placement: 'corridor-edge',
    location: row.location,
  };
}

function makeAp({ name, ip, location, model, vendor }, index) {
  const pos = positionFor(location, name, index, 'ap');
  const busy = /A2[4-9]|B1[8-9]|C14|D2[2-4]|D3[01]|E2[0-5]/.test(location);
  const users = busy ? 30 + (index % 6) : 8 + (index % 20);
  return {
    id: name,
    type: 'ap',
    name,
    building: pos.buildingId,
    x: pos.x,
    z: pos.z,
    floor: floorFor(location, name),
    status: busy ? 'warning' : 'online',
    users,
    mbps: busy ? 112 + (index % 12) * 7 : 32 + (index % 12) * 5,
    channel: ip,
    ip,
    model,
    vendor,
    role: vendor === 'Cisco' ? 'Cisco 無線 AP' : 'D-Link DAP-X2850 無線 AP',
    room: roomLabelFor(location, name),
    placement: 'room-center',
    location,
  };
}

const coreDevices = [
  makeSwitch({ name: 'CKJHS-L3', ip: '10.226.133.254', mac: '98:49:25:AE:46:C6', model: 'Juniper EX3400-24T', location: '凌雲樓-C05機房' }, 0, 'L3 核心路由交換器'),
  makeSwitch({ name: 'CKJHS-L2-253', ip: '10.226.133.253', mac: '04:BA:D6:DF:85:00', model: 'D-Link DXS-1210-28S', location: '凌雲樓-C05機房' }, 1, '匯聚層 10G 接取分配'),
];

const l2Access = parseRows(l2AccessRows).map((row, index) => makeSwitch(row, index + 2, 'L2 接取交換器'));
const edgeSwitches = parseRows(edgeRows).map((row, index) => makeSwitch(row, index + 60, /Cisco SW|Zyxel SW/.test(row.name) ? '無線骨幹交換器' : '樓層 / 教室邊緣 PoE 交換器'));

const ciscoAps = [
  makeAp({ name: 'Cisco APC.1', ip: '10.228.133.1', location: '凌雲樓-C05機房', model: 'Cisco AP Controller', vendor: 'Cisco' }, 0),
  makeAp({ name: 'Cisco AP.10', ip: '10.228.133.10', location: '未標示位置', model: 'Cisco Aironet', vendor: 'Cisco' }, 1),
  ...ciscoGroups.flatMap((group) => group.locations.map((room, offset) => {
    const apNumber = group.start + offset;
    return makeAp({
      name: `Cisco AP.${String(apNumber).padStart(2, '0')}`,
      ip: `10.228.133.${apNumber}`,
      location: /活動中心|圖書館/.test(room) ? room : `${group.prefix} ${room}`,
      model: 'Cisco Aironet',
      vendor: 'Cisco',
    }, apNumber);
  })),
];

const dlinkAps = dlinkApLocations.map(([name, ip, location], index) => makeAp({ name, ip, location, model: 'D-Link DAP-X2850', vendor: 'D-Link' }, index + 100));
const servers = parseRows(serverRows).map((row, index) => makeServer(row, index + 240));
const devices = [...coreDevices, ...l2Access, ...edgeSwitches, ...ciscoAps, ...dlinkAps, ...servers];
const classroomEdgeSwitches = edgeSwitches.filter((device) => device.role === '樓層 / 教室邊緣 PoE 交換器');
const wirelessBackboneSwitches = edgeSwitches.filter((device) => device.role === '無線骨幹交換器');
const apControllers = ciscoAps.filter((device) => /controller/i.test(device.model));
const radioAps = [...ciscoAps, ...dlinkAps].filter((device) => !apControllers.includes(device));

function upstreamFor(device) {
  if (device.id === 'CKJHS-L3') return { switchId: device.id, port: 'CORE' };
  if (device.id === 'CKJHS-L2-253') return { switchId: 'CKJHS-L3', port: '524,533 ⇄ 27,28', speed: '2G 雙鏈路', medium: 'fiber' };
  if (/^CKJHS-L2-0?1$/.test(device.id)) return { switchId: 'CKJHS-L2-253', port: 'LAG 51,52', speed: '20G LAG', medium: 'fiber' };
  if (/^CKJHS-L2-0?4$/.test(device.id)) return { switchId: 'CKJHS-L2-253', port: 'LAG 51,52', speed: '20G LAG', medium: 'fiber' };
  if (/^CKJHS-L2-0?6$/.test(device.id)) return { switchId: 'CKJHS-L2-253', port: 'LAG 51,52', speed: '20G LAG', medium: 'fiber' };
  if (/^CKJHS-L2-/.test(device.id)) return { switchId: 'CKJHS-L2-253', port: `SFP+ ${device.ip.split('.').pop()}`, speed: /L2-(07|08|09|05|11|02|03|13)/.test(device.id) ? '10G' : '1G/10G', medium: 'fiber' };
  if (device.id === 'Cisco SW.241') return { switchId: 'CKJHS-L2-01', port: '10G uplink', speed: '10G', medium: 'fiber' };
  if (device.id === 'Cisco SW.242' || device.id === 'Cisco SW.243') return { switchId: 'CKJHS-L2-03', port: '10G uplink', speed: '10G', medium: 'fiber' };
  if (device.id === 'Cisco SW.244' || device.id === 'Zyxel SW.245') return { switchId: 'CKJHS-L2-04', port: '10G uplink', speed: '10G', medium: 'fiber' };
  if (device.id === 'Cisco SW.246') return { switchId: 'CKJHS-L2-05', port: '10G uplink', speed: '10G', medium: 'fiber' };
  if (device.id === 'Cisco SW.247') return { switchId: 'CKJHS-L2-06', port: '10G uplink', speed: '10G', medium: 'fiber' };

  const buildingUpstream = {
    'xikun-a': device.vendor === 'Cisco' ? 'Cisco SW.241' : 'CKJHS-L2-02',
    'xikun-b': device.vendor === 'Cisco' ? 'Cisco SW.242' : 'CKJHS-L2-03',
    'xikun-c': device.vendor === 'Cisco' ? 'Cisco SW.244' : 'CKJHS-L2-04',
    'xikun-d': device.vendor === 'Cisco' ? 'Cisco SW.246' : 'CKJHS-L2-11',
    'xikun-e': device.vendor === 'Cisco' ? 'Cisco SW.247' : 'CKJHS-L2-06',
    'xikun-library': 'CKJHS-L2-08',
    'xikun-activity': 'CKJHS-L2-14',
    'xikun-guard': 'CKJHS-L2-48',
    'xikun-stand': 'CKJHS-L2-37',
  };
  return { switchId: buildingUpstream[device.building] || 'CKJHS-L2-253', port: `Gi1/0/${(Number(device.ip.split('.').pop()) % 48) + 1}`, speed: '1G PoE', medium: 'cat6' };
}

const networkLinks = devices
  .filter((device) => device.type === 'ap' || device.type === 'switch')
  .map((device, index) => {
    const upstream = upstreamFor(device);
    const building = buildingMap.get(device.building);
    const portNumber = String((Number(device.ip?.split('.').pop()) || index) % 48 || 48).padStart(2, '0');
    const medium = upstream.medium || (device.type === 'ap' ? 'cat6' : 'fiber');
    return {
      id: `xikun-link-${device.id.replace(/[^A-Za-z0-9]+/g, '-')}`,
      deviceId: device.id,
      switchId: upstream.switchId,
      switchPort: upstream.port,
      patchPanel: `${building?.name || '校園'} ${device.floor} PP`,
      patchPort: medium === 'fiber' ? `FO-${portNumber}` : `P${portNumber}`,
      vlan: device.type === 'ap' ? (device.vendor === 'Cisco' ? 'VLAN Cisco WiFi / 10.228.133.0' : 'VLAN D-Link WiFi / 10.129.133.0') : 'VLAN Mgmt / 10.226.133.0',
      cableId: `CKJHS-${device.building.replace('xikun-', '').toUpperCase()}-${portNumber}`,
      medium,
      fiberCore: medium === 'fiber' ? `Core ${portNumber}` : '',
      uplinkTo: upstream.switchId === device.id ? '' : upstream.switchId,
      status: device.status,
      note: `${device.role || '設備'}；${device.location || ''}${upstream.speed ? `；${upstream.speed}` : ''}`,
    };
  });

const heatZones = [
  { id: 'xikun-core-zone', label: '凌雲樓 C05 核心機房', x: 4.8, z: -5.9, w: 11.8, d: 14, signal: 'good', traffic: 'critical', users: 277, mbps: 5200, note: 'CKJHS-L3、CKJHS-L2-253、DHCP 服務與資訊中心設備集中區。' },
  { id: 'xikun-a-zone', label: '迎曦樓 A棟 AP 密集區', x: -1.5, z: 21.2, w: 79.7, d: 14.1, signal: 'fair', traffic: 'high', users: 310, mbps: 2600, note: 'A24/A28/A29~A43 多個 AP 與接取交換器集中。' },
  { id: 'xikun-b-zone', label: '德馨樓 B棟 PoE 邊緣區', x: -21.8, z: 2.1, w: 39, d: 14, signal: 'fair', traffic: 'high', users: 360, mbps: 3100, note: 'B04~B35 多台 DGS-1210-10P 與 Cisco AP。' },
  { id: 'xikun-c-zone', label: '凌雲樓 C14 無線骨幹', x: 4.8, z: -6, w: 12.7, d: 33.8, signal: 'good', traffic: 'high', users: 280, mbps: 2950, note: 'CKJHS-L2-04、Cisco SW.244、Zyxel SW.245 與 C 棟 AP。' },
  { id: 'xikun-d-zone', label: '凱風樓 D22-D24 電腦教室', x: -21.9, z: -16.2, w: 38.9, d: 13.5, signal: 'fair', traffic: 'critical', users: 220, mbps: 3300, note: 'D22/D23/D24 電腦教室與多台 DGS-1250-52X。' },
  { id: 'xikun-e-zone', label: '向陽樓 E棟 PoE 區', x: 32.6, z: -6.1, w: 12.4, d: 32, signal: 'good', traffic: 'medium', users: 150, mbps: 1450, note: 'E16~E25 WS6-DGS-1210-10P/F1 與 Cisco SW.247。' },
];

const xikunSchool = {
  id: 'xikun-jhs',
  name: '新北市溪崑國中',
  buildings: enrichBuildingRoomsWithDevices(buildings, devices),
  devices,
  heatZones,
  networkLinks,
  planUrl: '/xikun-plan.png',
  meta: {
    unitId: 3,
    source: 'GSNM Control_DB MySQL',
    generatedAt: '2026-05-18',
    ipSegments: ['10.226.133.0/24 管理 / 核心 L3 與 L2', '10.228.133.0/24 邊緣交換器 + Cisco AP', '10.129.133.0/24 D-Link AP', '163.20.25.0/24 DHCP-Lan'],
    totals: {
      l3: 1,
      distribution: 1,
      l2Access: l2Access.length,
      classroomEdgeSwitches: classroomEdgeSwitches.length,
      wirelessBackboneSwitches: wirelessBackboneSwitches.length,
      radioAps: radioAps.length,
      apControllers: apControllers.length,
      devices: devices.length,
    },
  },
};

export default xikunSchool;
