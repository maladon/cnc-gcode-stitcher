(test final cut)
(Machine)
(  vendor: Altmill)
(  model: Generic 3-axis Mill)
(  description: Generic 3-axis)
(T1 D=0.25 CR=0 - ZMIN=0 - flat end mill)
G90 G94
G17
G20
(When using Fusion for Personal Use, the feedrate of rapid)
(moves is reduced to match the feedrate of cutting moves,)
(which can increase machining time. Unrestricted rapid moves)
(are available with a Fusion Subscription.)
G28 G91 Z0
G90

(2D Contour2)
T1
S16000 M3
G17 G90 G94
G54
G0 X4.4751 Y2.7
Z1.0688
G1 Z0.6687 F80
Z0.5081
Z0.025
G19 G2 Y2.675 Z0 J-0.025 K0
G1 Y2.65
G17 G2 X4.4501 Y2.625 I-0.025 J0
G1 X2.25
Z0.0625
X1.75
Z0
X0.5
G3 X0.375 Y2.5 I0 J-0.125
G1 Y1.25
Z0.0625
Y0.75
Z0
Y0.5
G3 X0.5 Y0.375 I0.125 J0
G1 X2.75
Z0.0625
X3.25
Z0
X4.5
G3 X4.625 Y0.5 I0 J0.125
G1 Y1.75
Z0.0625
Y2.25
Z0
Y2.5
G3 X4.5 Y2.625 I-0.125 J0
G1 X4.4501
G2 X4.4251 Y2.65 I0 J0.025
G1 Y2.675
G19 G3 Y2.7 Z0.025 J0 K0.025
G1 Z1.0688
G17

G28 G91 Z0
G90
G28 G91 X0 Y0
G90
M5
M30
