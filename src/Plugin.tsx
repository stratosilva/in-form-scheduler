import React, { useState, useEffect } from 'react'
import { useDataMutation, useDataEngine } from '@dhis2/app-runtime'
import { InputField, Button, ButtonStrip, NoticeBox, CircularLoader } from '@dhis2/ui'

// Ensure this matches the alias in your Tracker Configurator exactly
const DE_SCHEDULING_DONE = 'schedulingDone';

interface ScheduleNextVisitPluginProps {
    orgUnitId?: string;
    values?: Record<string, any>; 
    setFieldValue?: (payload: { fieldId: string; value: any }) => void;
    daysAhead?: number;
}

type StatusMessage = {
    type: 'success' | 'error' | 'warning';
    text: string;
}

const createScheduledEvent = {
    resource: 'tracker',
    type: 'create',
    params: { async: false },
    data: ({ data }: { data: Record<string, any> }) => data,
}

const getDefaultDueDate = (daysAhead: number): string => {
    const date = new Date()
    date.setDate(date.getDate() + daysAhead)
    return date.toISOString().slice(0, 10)
}

const ScheduleNextVisitPlugin: React.FC<ScheduleNextVisitPluginProps> = ({
    orgUnitId,
    values = {}, 
    setFieldValue,
    daysAhead = 28,
}) => {
    const [dueDate, setDueDate] = useState<string>(getDefaultDueDate(daysAhead))
    const [saving, setSaving] = useState<boolean>(false)
    const [loadingContext, setLoadingContext] = useState<boolean>(true)
    const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
    const [context, setContext] = useState<Record<string, string | null>>({})

    const engine = useDataEngine()

    useEffect(() => {
        const fetchContext = async () => {
            let hash = '';
            try {
                hash = window.parent.location.hash || window.top?.location.hash || '';
            } catch (error) {
                console.warn('Cross-origin block in Dev Mode. Parent URL inaccessible.');
            }

            const params = new URLSearchParams(hash.split('?')[1] || '');
            
            const urlP = params.get('programId');
            const urlPs = params.get('stageId');
            const urlOu = orgUnitId || params.get('orgUnitId');
            const urlTei = params.get('teiId');
            const urlEnroll = params.get('enrollmentId');
            const eventId = params.get('eventId');

            if (urlP && urlPs && urlTei && urlEnroll) {
                // If brand new event, default status to ACTIVE
                setContext({ p: urlP, ps: urlPs, ou: urlOu, tei: urlTei, enroll: urlEnroll, status: 'ACTIVE' });
                setLoadingContext(false);
                return;
            }

            if (eventId) {
                try {
                    const response: any = await engine.query({
                        eventDetails: { resource: `tracker/events/${eventId}` }
                    });
                    const eventData = response.eventDetails;
                    setContext({
                        p: eventData.program,
                        ps: eventData.programStage,
                        ou: urlOu || eventData.orgUnit,
                        tei: eventData.trackedEntity,
                        enroll: eventData.enrollment,
                        status: eventData.status, // We capture the event status here!
                    });
                } catch (error) {
                    console.error("Failed to fetch event context:", error);
                    setStatusMessage({ type: 'error', text: 'Failed to retrieve event details.' });
                }
            } else {
                setContext({ p: urlP, ps: urlPs, ou: urlOu, tei: urlTei, enroll: urlEnroll, status: 'ACTIVE' });
            }
            
            setLoadingContext(false);
        };

        fetchContext();
    }, [orgUnitId, engine]);

    // 1. Check if the native DHIS2 form DE is ticked (for active forms)
    const isSchedulingDone = values[DE_SCHEDULING_DONE] === 'true' || values[DE_SCHEDULING_DONE] === true;
    
    // 2. Check if the event is already completed (for historical edits)
    const isEventCompleted = context.status === 'COMPLETED';
    
    // 3. Disable the button if either condition is true
    const isDisabled = isSchedulingDone || isEventCompleted;

    const [createEvent] = useDataMutation(createScheduledEvent, {
        onComplete: () => {
            setSaving(false)
            
            // Push the string 'true' back to the form so the Program Rule is satisfied
            if (setFieldValue && typeof setFieldValue === 'function') {
                setFieldValue({ fieldId: DE_SCHEDULING_DONE, value: 'true' });
            }

            setStatusMessage({
                type: 'success',
                text: 'Visit scheduled successfully! Please complete the form to finalize the visit.',
            })
        },
        onError: (error: Error) => {
            setSaving(false)
            setStatusMessage({
                type: 'error',
                text: error.message || 'Failed to schedule the next visit.',
            })
        },
    })

    const handleSchedule = async (): Promise<void> => {
        if (!context.p || !context.ps || !context.ou || !context.tei || !context.enroll) {
            setStatusMessage({ type: 'error', text: 'System Context Error: Missing IDs.' })
            return
        }

        setStatusMessage(null)
        setSaving(true)

        await createEvent({
            data: {
                events: [{
                    program: context.p,
                    programStage: context.ps,
                    orgUnit: context.ou,
                    trackedEntity: context.tei,
                    enrollment: context.enroll,
                    status: 'SCHEDULE',
                    scheduledAt: dueDate,
                    notes: [],
                }]
            },
        })
    }

    if (loadingContext) {
        return (
            <div style={{ marginTop: -8, padding: '16px', border: '1px solid #dfe1e6', borderRadius: 4, textAlign: 'center' }}>
                <CircularLoader small />
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#4a5768' }}>Loading scheduling context...</p>
            </div>
        )
    }

    return (
        <div style={{ marginTop: -8, padding: '8px 12px', border: '1px solid #dfe1e6', borderRadius: 4 }}>
            <style>{`
                .full-click-date input[type="date"] {
                    position: relative;
                    cursor: pointer;
                }
                .full-click-date input[type="date"]::-webkit-calendar-picker-indicator {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    cursor: pointer;
                }
            `}</style>

            <NoticeBox title="Schedule next visit" small style={{ marginBottom: 8, padding: '8px 12px' }}>
                {isEventCompleted 
                    ? "This visit is already completed. No further scheduling is required." 
                    : (isSchedulingDone 
                        ? "A future visit has already been scheduled from this event."
                        : `Verify the next visit date (defaulting to ${daysAhead} days from today), then click 'Save'.`)}
            </NoticeBox>

            <div className="full-click-date" style={{ marginBottom: 8, marginTop: 4 }}>
                <InputField
                    type="date"
                    label="Next visit due date"
                    value={dueDate}
                    inputWidth="100%"
                    onChange={({ value }: { value: string }) => setDueDate(value)}
                    min={getDefaultDueDate(1)}
                    max={getDefaultDueDate(365)}
                    disabled={isDisabled} 
                />
            </div>

            <ButtonStrip style={{ marginTop: 8 }}>
                <Button primary onClick={handleSchedule} disabled={saving || isDisabled} small>
                    {saving ? <CircularLoader small /> : (isDisabled ? 'Visit already scheduled' : 'Save scheduled visit')}
                </Button>
            </ButtonStrip>

            {statusMessage && (
                <NoticeBox
                    error={statusMessage.type === 'error'}
                    valid={statusMessage.type === 'success'}
                    small
                    style={{ marginTop: 12, padding: '8px 12px' }}
                >
                    {statusMessage.text}
                </NoticeBox>
            )}
        </div>
    )
}

export default ScheduleNextVisitPlugin
