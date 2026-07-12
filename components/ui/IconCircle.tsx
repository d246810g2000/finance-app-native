import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withContinuousRadius } from '../../theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface IconCircleProps {
    name: IoniconsName;
    color: string;
    backgroundColor?: string;
    size?: number;
    iconSize?: number;
}

export default function IconCircle({
    name,
    color,
    backgroundColor,
    size = 36,
    iconSize = 18,
}: IconCircleProps) {
    const radius = size / 2;

    return (
        <View
            style={[
                styles.circle,
                withContinuousRadius(radius),
                {
                    width: size,
                    height: size,
                    backgroundColor: backgroundColor ?? color + '18',
                },
            ]}
        >
            <Ionicons name={name} size={iconSize} color={color} />
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
