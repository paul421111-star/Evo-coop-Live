import type { CallAudioRouting } from './CallAudioSetup'

export type RoutedCallMode = 'private' | 'onAir' | 'talkback'

type AudioRouter = {
  setInputDevice: (deviceId: string) => Promise<void>
  speakerDevices: {
    set: (deviceIdOrIds: string | string[]) => Promise<void>
  }
}

export async function applyCallAudioRoute(
  audio: AudioRouter,
  routing: CallAudioRouting,
  mode: RoutedCallMode,
) {
  if (!routing.headsetInputId || !routing.headsetOutputId) {
    throw new Error('Selecione o microfone e o fone do headset.')
  }
  if (mode === 'private') {
    // Fecha a saída da mesa antes de reabrir o microfone da atendente.
    await audio.speakerDevices.set(routing.headsetOutputId)
    await audio.setInputDevice(routing.headsetInputId)
    return
  }
  if (mode === 'talkback') {
    // A saída continua na mesa; somente as lapelas dão lugar ao talkback.
    await audio.setInputDevice(routing.headsetInputId)
    return
  }
  if (
    !routing.ucaInputId ||
    !routing.ucaOutputId ||
    routing.ucaOutputId === routing.headsetOutputId
  ) {
    throw new Error(
      'Selecione entradas e saídas diferentes para o headset e a UCA222.',
    )
  }
  // Abre primeiro as lapelas para o convidado e somente depois a voz dele na mesa.
  await audio.setInputDevice(routing.ucaInputId)
  await audio.speakerDevices.set([
    routing.headsetOutputId,
    routing.ucaOutputId,
  ])
}
