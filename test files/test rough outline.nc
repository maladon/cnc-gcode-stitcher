(test rough outline)
(Machine)
(  vendor: Altmill)
(  model: Generic 3-axis Mill)
(  description: Generic 3-axis)
(T2 D=0.25 CR=0 - ZMIN=0.008 - flat end mill)
G90 G94
G17
G20
(When using Fusion for Personal Use, the feedrate of rapid)
(moves is reduced to match the feedrate of cutting moves,)
(which can increase machining time. Unrestricted rapid moves)
(are available with a Fusion Subscription.)
G28 G91 Z0
G90

(2D Contour1)
T2
S19000 M3
G17 G90 G94
G54
G0 X0.475 Y2.708
Z1.0688
G1 Z0.6687 F70
Z0.5081 F13.33
Z0.2634
G19 G2 Y2.683 Z0.2384 J-0.025 K0 F70
G1 Y2.658
G17 G3 X0.5 Y2.633 I0.025 J0
G1 X4.5
G2 X4.633 Y2.5 I0 J-0.133
G1 Y0.5
G2 X4.5 Y0.367 I-0.133 J0
G1 X0.5
G2 X0.367 Y0.5 I0 J0.133
G1 Y2.5
G2 X0.5 Y2.633 I0.133 J0
G3 X0.525 Y2.658 I0 J0.025
G1 Y2.683
G19 G3 Y2.708 Z0.2634 J0 K0.025
G1 Z0.6687
X0.475
Z0.2777 F13.33
Z0.033
G2 Y2.683 Z0.008 J-0.025 K0 F70
G1 Y2.658
G17 G3 X0.5 Y2.633 I0.025 J0
G1 X4.5
G2 X4.633 Y2.5 I0 J-0.133
G1 Y0.5
G2 X4.5 Y0.367 I-0.133 J0
G1 X0.5
G2 X0.367 Y0.5 I0 J0.133
G1 Y2.5
G2 X0.5 Y2.633 I0.133 J0
G3 X0.525 Y2.658 I0 J0.025
G1 Y2.683
G19 G3 Y2.708 Z0.033 J0 K0.025
G1 Z1.0688
G17

G28 G91 Z0
G90
G28 G91 X0 Y0
G90
M5
M30
