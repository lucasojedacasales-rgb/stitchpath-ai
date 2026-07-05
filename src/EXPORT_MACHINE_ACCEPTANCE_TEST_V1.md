# EXPORT_MACHINE_ACCEPTANCE_TEST_V1

Objetivo: preparar prueba real de aceptación en máquina usando el estado estable congelado del pipeline.

## Checkpoint

checkpointCreated=true
checkpointName=CHECKPOINT_PIPELINE_STABLE_EXPORT_READY_V1
projectId=6a48d4f03ec7e0d075352fc9

## Estado de exportación

exportAllowed=true
exportBlocked=false
exportBlockingReason=none
universalStatus=VALID
formatStatusDST=VALID
formatStatusDSB=VALID

## Archivos generados

Los archivos DST y DSB fueron generados mediante el backend existente `exportEmbroideryFile`, usando exactamente la misma secuencia `finalEmbroideryCommands` validada.

dstGenerated=true
dsbGenerated=true
dstBytes=26073
dsbBytes=25029
recommendedFirstFormat=DSB
recommendedSecondFormat=DST

## Sincronización de comandos

finalLookExportMismatch=false
simulationMatchesFinalCommands=true
finalLookMatchesFinalCommands=true
exportUsesSameCommandSequence=true

## Métricas de comandos

totalCommands=8288
totalStitches=7780
totalJumps=380
totalTrims=116
totalColors=7
maxVisibleStitchMm=5.316
visibleDiagonalStitches=86
unsupportedLongStitches=0
fillOutsideRegionCount=38

## Instrucciones visibles para la prueba

Prueba recomendada:
1. Exporta primero DSB.
2. Si DSB no abre, prueba DST.
3. Haz foto de la pantalla de la máquina.
4. Comprueba si la máquina muestra tamaño, colores y puntadas.
5. No bordar todavía si visualmente ves líneas peligrosas; primero confirmar que lo acepta.

## Decisión

DSB y DST son válidos, el export no está bloqueado y Simular/Final/Export usan la misma secuencia de comandos. No se aplicó reparación local ni mejora visual en este paso.

machineTestReady=true
recommendedFirstFormat=DSB
recommendedSecondFormat=DST
safeToProceedToLocalLongStitchRepair=true