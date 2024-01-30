% Calibration for FollowJS spots

clear;
pkg load image;

% follow calibration
clear;

calibDataRaw = load("spot.calData.txt", "-ascii");

if(size(calibDataRaw,1) ~= 81)
    disp("Incomplete Calibration Data!");
    return;
end

calibEntries = min(sum(calibDataRaw(:,1)~= -1),sum(calibDataRaw(:,2)~= -1));

targetData = zeros(calibEntries,2);
calibData = zeros(calibEntries,2);

nextFreeRow = 1;
for x=1:9
    for y=1:9
        if (calibDataRaw((y-1)*9+x,1) ~= -1) && (calibDataRaw((y-1)*9+x,2) ~= -1)
            targetData(nextFreeRow,:)=[x*0.1 y*0.1];
            calibData(nextFreeRow,:)=calibDataRaw((y-1)*9+x,:);
            nextFreeRow = nextFreeRow + 1;
        end
    end
end

tformDeg2 = cp2tform(targetData,calibData,'polynomial',2);
tformDeg3 = cp2tform(targetData,calibData,'polynomial',3);
tformDeg4 = cp2tform(targetData,calibData,'polynomial',4);

tfABdeg2 = tformDeg2.tdata;
tfABdeg3 = tformDeg3.tdata;
tfABdeg4 = tformDeg4.tdata;

save("spot.cal2.txt", "tfABdeg2", "-ascii", "-double");
save("spot.cal3.txt", "tfABdeg3", "-ascii", "-double");
save("spot.cal4.txt", "tfABdeg4", "-ascii", "-double");

disp("Calibration exported successfully!");


% Debug Prints

X = calibData(:,1);
Y = calibData(:,2);

tfAdeg2 = tformDeg2.tdata(:,1);
tfBdeg2 = tformDeg2.tdata(:,2);
Udeg2 = tfAdeg2(1) + tfAdeg2(2).*X + tfAdeg2(3).*Y + tfAdeg2(4).*X.*Y + tfAdeg2(5).*X.^2 + tfAdeg2(6).*Y.^2;
Vdeg2 = tfBdeg2(1) + tfBdeg2(2).*X + tfBdeg2(3).*Y + tfBdeg2(4).*X.*Y + tfBdeg2(5).*X.^2 + tfBdeg2(6).*Y.^2;

tfAdeg3 = tformDeg3.tdata(:,1);
tfBdeg3 = tformDeg3.tdata(:,2);
Udeg3 = tfAdeg3(1) + tfAdeg3(2).*X + tfAdeg3(3).*Y + tfAdeg3(4).*X.*Y + tfAdeg3(5).*X.^2 + tfAdeg3(6).*Y.^2 + tfAdeg3(7).*Y.*X.^2 + tfAdeg3(8).*X.*Y.^2 + tfAdeg3(9).*X.^3 + tfAdeg3(10).*Y.^3;
Vdeg3 = tfBdeg3(1) + tfBdeg3(2).*X + tfBdeg3(3).*Y + tfBdeg3(4).*X.*Y + tfBdeg3(5).*X.^2 + tfBdeg3(6).*Y.^2 + tfBdeg3(7).*Y.*X.^2 + tfBdeg3(8).*X.*Y.^2 + tfBdeg3(9).*X.^3 + tfBdeg3(10).*Y.^3;

tfAdeg4 = tformDeg4.tdata(:,1);
tfBdeg4 = tformDeg4.tdata(:,2);
Udeg4 = tfAdeg4(1) + tfAdeg4(2).*X + tfAdeg4(3).*Y + tfAdeg4(4).*X.*Y + tfAdeg4(5).*X.^2 + tfAdeg4(6).*Y.^2 + tfAdeg4(7).*X.^2.*Y + tfAdeg4(8).*X.*Y.^2 + tfAdeg4(9).*X.^3 + tfAdeg4(10).*Y.^3 + tfAdeg4(11).*X.^3.*Y + tfAdeg4(12).*X.^2.*Y.^2 + tfAdeg4(13).*X.*Y.^3 + tfAdeg4(14).*X.^4 + tfAdeg4(15).*Y.^4;
Vdeg4 = tfBdeg4(1) + tfBdeg4(2).*X + tfBdeg4(3).*Y + tfBdeg4(4).*X.*Y + tfBdeg4(5).*X.^2 + tfBdeg4(6).*Y.^2 + tfBdeg4(7).*X.^2.*Y + tfBdeg4(8).*X.*Y.^2 + tfBdeg4(9).*X.^3 + tfBdeg4(10).*Y.^3 + tfBdeg4(11).*X.^3.*Y + tfBdeg4(12).*X.^2.*Y.^2 + tfBdeg4(13).*X.*Y.^3 + tfBdeg4(14).*X.^4 + tfBdeg4(15).*Y.^4;


figure(1, "visible","off");
clf;
grid on;
hold on;
axis([0 1 0 1]);
scatter(calibData(:,1),calibData(:,2),".");
scatter(targetData(:,1),targetData(:,2),"+");
scatter(Udeg2,Vdeg2,"x");
scatter(Udeg3,Vdeg3,"o");
scatter(Udeg4,Vdeg4,"^");
print spot.pdf -landscape -color -bestfit
